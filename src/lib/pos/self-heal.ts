import { browser } from '$app/environment';

const POS_SELF_HEAL_ENABLED_KEY = 'novum_pos_self_heal_enabled';
const POS_SELF_HEAL_MARK_PREFIX = 'novum_pos_self_heal_mark:';
const POS_SELF_HEAL_MARK_TTL_MS = 90_000;

export function getPosSelfHealEnabled(): boolean {
	if (!browser) return false;
	const raw = localStorage.getItem(POS_SELF_HEAL_ENABLED_KEY);
	if (raw == null) return true;
	return raw !== '0';
}

export function setPosSelfHealEnabled(enabled: boolean): void {
	if (!browser) return;
	localStorage.setItem(POS_SELF_HEAL_ENABLED_KEY, enabled ? '1' : '0');
}

export function clearPosSelfHealMark(screenKey: string): void {
	if (!browser) return;
	sessionStorage.removeItem(`${POS_SELF_HEAL_MARK_PREFIX}${screenKey}`);
}

export function tryPosSelfHealReload(screenKey: string): boolean {
	if (!browser || typeof window === 'undefined') return false;
	if (!getPosSelfHealEnabled()) return false;

	const markKey = `${POS_SELF_HEAL_MARK_PREFIX}${screenKey}`;
	const lastRaw = sessionStorage.getItem(markKey);
	const last = lastRaw ? Number(lastRaw) : 0;
	const now = Date.now();
	if (Number.isFinite(last) && last > 0 && now - last < POS_SELF_HEAL_MARK_TTL_MS) return false;

	sessionStorage.setItem(markKey, String(now));
	window.location.reload();
	return true;
}
