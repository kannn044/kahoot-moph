import HostRoomClient from "./HostRoomClient";

export default async function HostRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ pin: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { pin } = await params;
  const sp = await searchParams;
  const hostKeyParam = typeof sp.hostKey === "string" ? sp.hostKey : "";

  return <HostRoomClient pin={pin} hostKeyParam={hostKeyParam} />;
}
