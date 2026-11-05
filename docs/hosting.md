# Hosting the transcriber from a home Windows machine

This runbook exposes the app to your own devices through **Tailscale Serve** (primary) and
**Cloudflare Tunnel + Access** (fallback). It assumes the app runs on the Windows 11 machine that
already hosts the project.

The app is deliberately not built for public hosting:

- every conversation lives as files under `.data/` (audio, transcripts, history);
- the job queue is a single in-process promise chain;
- audio playback needs HTTP Range responses from local disk;
- **there is no authentication** — any caller can list, read, export, or delete conversations.

So the rules are: keep `next start` bound to `127.0.0.1`, run exactly **one** instance, and put an
authenticating tunnel in front. Never expose port 3000 directly and never use Tailscale Funnel
(public) or a Cloudflare hostname without Access.

```
laptop / phone ── Tailscale (WireGuard) ──┐
                                          ├──► 127.0.0.1:3000  (next start)
any browser ── Cloudflare Access + cloudflared ──┘
                                          └──► <project>\.data
```

Paths below use this machine's project directory. Adjust if it moves:

```
C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding
```

---

## 1. Production build

Run these in PowerShell in the project directory. Close `npm run dev` first — dev and production
share `.next`.

```powershell
cd "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding"
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:3000>, upload a short clip, and check playback/seek, export, and
re-transcribe. `npm start` already binds `127.0.0.1`; leave it that way.

`.env.local` stays in the project root (gitignored) and is read from the process working directory.
Do not bake keys into scripts or service arguments.

Stop the foreground `npm start` with Ctrl+C before installing the service.

---

## 2. Run it as a Windows service (NSSM)

NSSM keeps `next start` alive across logouts, crashes, and reboots. Run PowerShell **as
Administrator**.

```powershell
# Install NSSM (winget or choco)
winget install NSSM.NSSM

# Find node
(Get-Command node).Source    # normally C:\Program Files\nodejs\node.exe

# Create the log directory
New-Item -ItemType Directory -Force "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\logs"

# Register the service. Single quotes preserve the inner quotes around the next CLI path.
nssm install Transcriber "C:\Program Files\nodejs\node.exe"
nssm set Transcriber AppParameters '"C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\node_modules\next\dist\bin\next" start -H 127.0.0.1 -p 3000'
nssm set Transcriber AppDirectory "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding"
nssm set Transcriber AppStdout "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\logs\transcriber.log"
nssm set Transcriber AppStderr "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\logs\transcriber-error.log"
nssm set Transcriber AppRotateFiles 1
nssm set Transcriber AppRotateOnline 1
nssm set Transcriber AppRotateBytes 10485760
nssm set Transcriber Start SERVICE_AUTO_START
nssm set Transcriber AppExit Default Restart
nssm set Transcriber AppRestartDelay 5000
nssm start Transcriber
```

Verify:

```powershell
nssm status Transcriber
Get-Content "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\logs\transcriber-error.log" -Tail 20
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:3000/api/transcriptions
```

The last command should print `200`.

Keep the machine awake on AC power, or the app goes offline:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

Reboot once and confirm the service comes back. Do not leave a separate `npm run dev` on port 3000.

---

## 3. Tailscale Serve (primary path)

Tailscale gives you a private HTTPS URL reachable only from devices signed into your tailnet. It has
no request-body limit worth worrying about and keeps traffic end-to-end encrypted.

On the host:

```powershell
winget install Tailscale.Tailscale
tailscale up
```

In the Tailscale admin console:

1. Enable **MagicDNS** for the tailnet.
2. Enable **HTTPS certificates** (DNS page).
3. Optionally add an ACL so only your own devices can reach this host.

Then publish the local port:

```powershell
tailscale serve --bg 3000
tailscale serve status
```

Use the printed `https://<machine>.<tailnet>.ts.net` URL on your phone/laptop after installing
Tailscale and signing in. From another device, verify:

- the library loads and a real recording uploads;
- playback and seeking work (Range requests);
- export and re-transcribe work;
- data survives a service restart.

To undo: `tailscale serve reset`.

**Do not run `tailscale funnel`.** Funnel is public and the app has no auth.

---

## 4. Cloudflare Tunnel + Access (fallback)

Use this for a device that cannot run Tailscale (for example, a borrowed browser). Cloudflare adds a
normal hostname gated by email/SSO, but its standard plans cap proxied request bodies at roughly
**100 MB** and origin requests at roughly **100 seconds**. Long/high-bitrate uploads can fail with
`413` or `524` before reaching the app. Upload those through Tailscale instead.

1. In **Cloudflare Zero Trust → Networks → Tunnels**, create a tunnel and copy its token.
2. Install and register `cloudflared` on the host:

   ```powershell
   winget install --id Cloudflare.cloudflared
   cloudflared service install <TOKEN>
   ```

3. In the tunnel's **Public Hostname** settings add:

   - Subdomain: `transcriber`
   - Domain: your Cloudflare-managed domain
   - Service: `http://127.0.0.1:3000`

4. In **Access → Applications**, add a **Self-hosted** application for
   `transcriber.<your-domain>` with one policy: `Allow` → `Emails` → your address (one-time PIN), or
   your SSO provider. Session duration ~24 hours.

5. Verify from an unauthenticated browser: the request must be redirected to the Cloudflare Access
   login, not show the app. Then verify from your own browser.

Security checks:

- No **Bypass** policy for `/api/*`, `/c/*`, or anything else.
- The DNS record for the hostname is proxied (orange cloud) and attached to the tunnel.
- The tunnel token is a secret; keep it out of notes and screenshots.
- Cloudflare terminates TLS and is in the request path. Prefer Tailscale for sensitive audio.

To check quickly:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" https://transcriber.example.com
```

Expect a Cloudflare Access redirect (`302`/`303`) rather than `200`.

---

## 5. Backups

Back up `.data/`; it holds the only copies of the audio and transcripts. Do not back up
`.env.local` to an unencrypted location — recreate it instead.

Option A — encrypted, off-site (restic to Backblaze B2, Cloudflare R2, or S3):

```powershell
winget install restic.restic
$env:RESTIC_PASSWORD = '<a long passphrase stored in a password manager>'
$repo = 's3:https://s3.eu-central-003.backblazeb2.com/transcriber-backups'

restic -r $repo init          # once
restic -r $repo backup "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\.data"
restic -r $repo forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

Schedule that with Task Scheduler nightly.

Option B — local external drive:

```powershell
robocopy "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding\.data" "E:\backups\transcriber\.data" /MIR /R:2 /W:5
```

Restore drill (do this once so you know it works):

1. `nssm stop Transcriber`
2. Copy one library folder back into `.data\library\`
3. `nssm start Transcriber`
4. Open it in the app and confirm the audio, transcript, and Versions list are intact.

Also watch free disk space: each conversation keeps its original audio, peaks, and one transcript
JSON per re-run.

---

## 6. Updating the app

```powershell
nssm stop Transcriber
cd "C:\Users\OSL\Documents\Tech Projects\transcriber_note_coding"
npm ci
npm run build
nssm start Transcriber
```

- Never run `npm run build` while `npm run dev` is running; they share `.next`.
- `.data/` and `.env.local` are untouched by updates.
- If a transcription was running when the service stopped, it is marked **interrupted**. Open it and
  click Retry. This is deliberate: the provider may already have been billed, so jobs are never
  retried automatically.
- After updating, repeat the verification from section 3 (upload, seek, export, re-transcribe).

---

## 7. Security checklist

- [ ] Windows Firewall has **no inbound rule** for port 3000; only loopback and tailnet traffic.
- [ ] Tailscale URL works; Funnel is off (`tailscale funnel status` should show nothing).
- [ ] Cloudflare hostname is gated by Access; an incognito window hits the Access login.
- [ ] No Access bypass policies.
- [ ] `.env.local` is readable only by your Windows account; API keys are server-side only.
- [ ] Backups are encrypted and tested.
- [ ] The experimental Qwen sidecar is not exposed or running.
- [ ] BitLocker is on if the machine is portable or shared.
- [ ] Rotate provider keys if the machine is ever compromised.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Service exits immediately | Check `logs\transcriber-error.log`. Run the exact NSSM program/arguments manually in the project directory to see the error. |
| `EADDRINUSE` or port 3000 busy | A dev server or another `next start` is running. `netstat -ano | findstr :3000`, then stop it. |
| `ffmpeg`/`ffprobe` not found | `npm ci` did not install the static binaries. Check `node_modules\ffmpeg-static\ffmpeg.exe` and `node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe`; reinstall if missing. |
| Tailscale URL refuses to connect | `tailscale serve status`; confirm MagicDNS + HTTPS are enabled and the client device is signed in. |
| Cloudflare returns `413` | Request body over the plan limit. Upload through Tailscale. |
| Cloudflare returns `524` | Origin request exceeded ~100 s (usually a large/slow upload). Upload through Tailscale. |
| Cloudflare keeps redirecting to login | Check the Access application's domain/session settings and that cookies are allowed. |
| App offline after a while | Windows slept or rebooted. Check power settings and `nssm status Transcriber`. |
| Job shows **interrupted** | The service stopped or the machine rebooted mid-job. Click Retry. |
| App is slow during transcription | The queue is serial by design, and the provider call holds a slot. Wait or cancel; do not start a second instance against the same `.data`. |

---

## Optional hardening (not required for this setup)

- Add an unauthenticated `/api/health` route (no data) if you later add an external uptime monitor.
- Make the data directory configurable (`DATA_DIR` env) if `.data` moves to another drive.
- Add app-level shared-secret auth if you ever use Funnel or a public hostname without Access.
- Move to object storage + a durable worker queue only if this stops being a single-user tool.
