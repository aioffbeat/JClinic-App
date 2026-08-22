// GENERATED — DO NOT EDIT.
// Copied verbatim from the JClinic web app: apps/web/src/dial-help.ts
// Edit it THERE, then run: node scripts/sync-api-client.mjs
// CI runs this with --check, so an edit made here alone will fail the build.

import { telephonyApi } from './api';

/**
 * Ozonetel rejects a dial with a terse phrase ("Agent is not available") that tells a caller nothing
 * about what to fix. One place translates each known rejection into the actual next step, so every
 * call button in the app gives the same, actionable answer.
 */
export function dialHelp(error?: string | null): string {
  const e = (error ?? '').toLowerCase();
  if (/not ?mapped/.test(e)) {
    return 'Your login is not linked to an Ozonetel Agent ID. Ask an admin to set it on Admin → Users (Edit) or Pods → Telecallers & Ozonetel agents.';
  }
  if (/not a valid mobile number|invalid.*(cust|customer)?number/.test(e)) return error!;
  if (/not ?avail|not ?ready|not ?logged/.test(e)) {
    // Per Ozonetel's AgentManualDial docs this one message covers three distinct causes, and the
    // mode one is the least obvious: an agent can show "Ready" and still be refused because the
    // session is inbound-only. The server has already retried three times over ~6 s, so this is
    // not a timing blip.
    return 'Ozonetel still said "Agent is not available" after 3 tries over ~6 s. '
      + 'In the Ozonetel app: tap Ready (Blended), wait for it to turn green, then Call once. '
      + 'If this happens right after every call, your wrap-up is still open — finish it first. '
      + 'If it happens on every call: you are not logged in, or the session is inbound-only (not Manual/Blended).';
  }
  return error ? `Call failed — ${error}` : 'Call failed';
}


/**
 * Watch a just-placed call and tell the agent when it dies on OUR side of the line.
 *
 * Ozonetel's dial API answers "queued" long before anything rings; when the agent's browser phone
 * isn't connected the call collapses ~1 second later and only the post-call webhook records why.
 * Until now the screen kept showing the optimistic "answer the toolbar" message, so CREs clicked
 * Call again and again — production has runs of 7+ identical 1-second failures 10 seconds apart.
 *
 * Polls the call outcome a few times over ~20s and reports only the failure that has a next step
 * for the agent (`agent_no_answer`, meaning the patient was never dialled). A connected call, a
 * real patient no-answer, or an unresolved outcome say nothing — no news is still good news, and
 * a patient-side result already reaches the agent through their own ears.
 */
/**
 * The one procedure that has been proven to restore a dead browser phone, written for a
 * receptionist, in the order that works. Every failure message ends in it.
 */
export const TOOLBAR_FIX =
  'Your call leg was rejected within a second — the patient was never dialled, so clicking Call again will do the same. '
  + 'When this happens on EVERY call it is almost always your Ozonetel agent record, not your PC: the agent has no Skill mapped to the campaign. '
  + 'Ask the admin to open the CloudAgent admin panel → Agents → your agent → add skill "General" (agents who connect have it), then log out of the toolbar and log in again. '
  + 'If it happens only sometimes: one Ozonetel tab on one PC, headset selected in the toolbar audio settings, Blended + Ready, wait for the green phone icon, then Call.';

export function watchDial(callId: string, onAgentLineDead: (msg: string) => void, onRetried?: (r: { callId: string; msg: string }) => void): void {
  const DELAYS_MS = [6000, 13000, 21000];
  let step = 0;
  const check = async () => {
    try {
      const c = await telephonyApi.callStatus(callId);
      if (c.outcome === 'connected') return; // settled, all good
      if (c.outcome === 'agent_no_answer') {
        // The toolbar leg died unanswered on the agent's browser phone (the "auto reject"). Instead
        // of telling them to reopen the tab, re-place the SAME call via their own mobile — the
        // server does it once, and we tell them to pick up. Falls back to the old instruction only
        // when the agent has no phone on file or the phone leg is refused too.
        try {
          const r = await telephonyApi.retryViaPhone(callId);
          if (r.status === 'ringing') {
            onRetried?.({ callId: r.callId ?? '', msg: '📱 Your browser phone did not pick up, so this call is now ringing on YOUR MOBILE — answer it and the patient will be connected.' });
            return;
          }
          // Phone dialling needs an offline campaign the account does not have yet — that is an
          // admin/Ozonetel matter, never something to tell an agent mid-call. Show the fix instead.
          onAgentLineDead(TOOLBAR_FIX);
          return;
        } catch (e: any) {
          const why = e?.body?.message ?? e?.message ?? '';
          onAgentLineDead(
            'That call died on YOUR line — the patient was never dialled. '
            + (/no phone number/i.test(why)
              ? 'Ask an admin to add your phone number (Admin → Users) so calls can ring your mobile instead of the browser toolbar. Meanwhile: '
              : '')
            + 'Close the Ozonetel tab, open it again in a NEW tab, log in, allow microphone access, and wait for the phone icon to show connected. Then retry the call.',
          );
          return;
        }
      }
    } catch { /* transient — try the next tick */ }
    step += 1;
    if (step < DELAYS_MS.length) setTimeout(check, DELAYS_MS[step] - DELAYS_MS[step - 1]);
  };
  setTimeout(check, DELAYS_MS[0]);
}
