import Workspace from "@/components/Workspace";
import { getLang } from "@/lib/i18n/server";

/**
 * A thin shell: no data is read here. The page paints at once and the client loads its data from
 * /api/bootstrap, showing skeletons until it arrives. The proxy has already required a session.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  return <Workspace lang={await getLang()} initialWarehouse={w} />;
}
