import LobbyClient from "./LobbyClient";

export default async function LobbyPage({
  params,
  searchParams,
}: {
  params: Promise<{ pin: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { pin } = await params;
  const { name } = await searchParams;

  return <LobbyClient pin={pin} nicknameParam={name ?? ""} />;
}
