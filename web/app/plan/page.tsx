import { redirect } from "next/navigation";

/**
 * The quarterly plan is now the lower section of `/strategy` ("התוכנית" — the month and
 * the quarter on one page). This route stays so old links, bookmarks and the setup
 * checklist keep working, and lands on the quarter.
 */
export default function PlanPage() {
  redirect("/strategy#quarter");
}
