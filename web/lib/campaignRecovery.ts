/** A missing quota/history response must not hide the owner's stored campaign.
 * History remains a prerequisite for starting new work: it may contain an active job.
 */
export async function loadCampaignWorkspace<P, A, H>(load: {
  plan: () => Promise<P>; allowance: () => Promise<A>; history: () => Promise<H>;
}) {
  const [plan, allowance, history] = await Promise.allSettled([load.plan(), load.allowance(), load.history()]);
  // Expired access requires signing in, even when another read happened to succeed.
  for (const result of [plan, allowance, history]) {
    if (result.status === 'rejected' && result.reason?.status === 401) throw result.reason;
  }
  if (plan.status === 'rejected') throw plan.reason;
  return {
    plan: plan.value,
    allowance: allowance.status === 'fulfilled' ? allowance.value : null,
    history: history.status === 'fulfilled' ? history.value : null,
    unavailable: [allowance.status === 'rejected' ? 'allowance' : '', history.status === 'rejected' ? 'history' : ''].filter(Boolean),
  };
}
