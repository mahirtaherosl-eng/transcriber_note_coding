import Explorer from "@/components/explorer/Explorer";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Explorer id={id} />;
}
