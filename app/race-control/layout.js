import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function RaceControlLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/race-control");
  }

  return children;
}
