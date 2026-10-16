import { check } from './engine.mjs';

const MAX_SECONDS = 86400;
export function timerExpired(room, now) {
  return !!room.timer?.durationSeconds && room.timer.deadline !== null && room.timer.deadline <= now;
}
export function timerView(room, now) {
  const timer = room.timer;
  if (!timer?.durationSeconds) return { durationSeconds: 0, status: 'disabled', deadline: null, remainingMs: 0, serverNow: now };
  return {
    durationSeconds: timer.durationSeconds,
    status: room.phase === 'resolving' ? 'resolving' : timerExpired(room, now) ? 'expired' : timer.deadline === null ? 'paused' : 'running',
    deadline: timer.deadline,
    remainingMs: timer.deadline === null ? timer.remainingMs : Math.max(0, timer.deadline - now),
    serverNow: now
  };
}
export function restartTimer(room, now) {
  if (room.timer?.durationSeconds) room.timer = { durationSeconds: room.timer.durationSeconds, deadline: now + room.timer.durationSeconds * 1000, remainingMs: 0 };
}
export function changeTimer(room, command, seconds, now) {
  const current = timerView(room, now);
  if (command === 'configure') {
    check(Number.isInteger(seconds) && (seconds === 0 || seconds >= 30 && seconds <= MAX_SECONDS), 'Turn duration must be 30–86,400 whole seconds, or 0 to disable.');
    room.timer = { durationSeconds: seconds, deadline: seconds ? now + seconds * 1000 : null, remainingMs: 0 };
  } else if (command === 'pause') {
    check(current.status === 'running', 'Only a running timer can be paused.', 409);
    room.timer = { durationSeconds: current.durationSeconds, deadline: null, remainingMs: current.remainingMs };
  } else if (command === 'resume') {
    check(current.status === 'paused', 'Only a paused timer can be resumed.', 409);
    room.timer = { durationSeconds: current.durationSeconds, deadline: now + current.remainingMs, remainingMs: 0 };
  } else if (command === 'extend') {
    check(['running', 'paused', 'expired'].includes(current.status), 'Enable the turn timer first.', 409);
    check(Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_SECONDS && current.remainingMs + seconds * 1000 <= MAX_SECONDS * 1000, 'Extension must leave at most 24 hours on the clock.');
    const remainingMs = current.remainingMs + seconds * 1000;
    room.timer = { durationSeconds: current.durationSeconds, deadline: current.status === 'paused' ? null : now + remainingMs, remainingMs: current.status === 'paused' ? remainingMs : 0 };
  } else {
    check(false, 'Unknown timer command.');
  }
}
