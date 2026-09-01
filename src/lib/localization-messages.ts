export interface Formatters {
  date: (value: number) => string
  dateTime: (value: number) => string
  integer: (value: number) => string
  percent: (value: number) => string
  relative: (acceptedAt: number, now: number) => string
}

export interface MessageArgs {
  "document.title": undefined
  "document.description": undefined
  "brand.tagline": undefined
  "app.starting": undefined
  "nav.dashboard": undefined
  "nav.practice": undefined
  "nav.review": undefined
  "nav.studyPath": undefined
  "nav.account": undefined
  "nav.primary": undefined
  "nav.mobile": undefined
  "nav.toggle": undefined
  "nav.brandHome": undefined
  "nav.startPractice": undefined
  "nav.recoveryHint": undefined
  "nav.deletionHint": undefined
  "account.language.label": undefined
  "account.language.helper": undefined
  "account.language.persistenceFailed": undefined
  "practice.setup.questionBankNotice": undefined
  "sync.status.guest": undefined
  "sync.status.syncing": undefined
  "sync.status.synced": undefined
  "sync.status.offline": undefined
  "sync.status.attention": undefined
  "sync.status.signingOut": undefined
  "sync.status.acceptedAt": { acceptedAt: number; now: number }
  "sync.status.title": { acceptedAt: number }
  "sync.notification.dismiss": undefined
  "sync.notification.firstSyncRejected": undefined
  "sync.notification.signOutBlocked": undefined
  "sync.notification.unsupportedSchema": undefined
  "sync.notification.tooLarge": undefined
  "sync.notification.unsupportedMedia": undefined
  "sync.notification.malformedJson": undefined
  "sync.notification.invalidState": undefined
  "sync.notification.generic": undefined
  "account.notice.signInCallbackFailed": undefined
  "account.notice.signInStartFailed": undefined
  "account.notice.signedOut": undefined
  "account.notice.signOutBlocked": undefined
  "account.notice.signOutFailed": undefined
  "account.notice.resetGuestCompleted": undefined
  "account.notice.resetAccountCompleted": undefined
  "account.notice.resetFailed": undefined
  "account.notice.deleteCompleted": undefined
  "account.notice.deleteIdentityUnfinished": undefined
  "account.notice.deletePracticeUnfinished": undefined
  "account.notice.deleteFailed": undefined
  "account.eyebrow": undefined
  "account.title.guest": undefined
  "account.title.reconnect": undefined
  "account.title.signedIn": undefined
  "account.intro.guest": undefined
  "account.intro.reconnect": undefined
  "account.intro.signedIn": undefined
  "account.guest.title": undefined
  "account.guest.description": undefined
  "account.sync.title": undefined
  "account.sync.description": undefined
  "account.sync.statusFor": { username: string }
  "account.sync.avatarAlt": { username: string }
  "account.signIn.title": undefined
  "account.signIn.description": undefined
  "account.signIn.againTitle": undefined
  "account.signIn.againDescription": undefined
  "account.signIn.button": undefined
  "account.signIn.againButton": undefined
  "account.signIn.opening": undefined
  "account.signIn.unavailable": undefined
  "account.signOut.title": undefined
  "account.signOut.description": undefined
  "account.signOut.after": undefined
  "account.signOut.button": undefined
  "account.export.title": undefined
  "account.export.description": undefined
  "account.export.button": undefined
  "account.reset.title": undefined
  "account.reset.description": undefined
  "account.reset.detail": undefined
  "account.reset.button": undefined
  "account.delete.title": undefined
  "account.delete.finishTitle": undefined
  "account.delete.description": undefined
  "account.delete.finishDescription": undefined
  "account.delete.detail": undefined
  "account.delete.button": undefined
  "account.delete.retry": undefined
  "account.delete.deleting": undefined
  "account.confirm.resetTitle": undefined
  "account.confirm.resetGuest": undefined
  "account.confirm.resetAccount": undefined
  "account.confirm.resetConfirm": undefined
  "account.confirm.deleteTitle": undefined
  "account.confirm.deleteFinishTitle": undefined
  "account.confirm.delete": undefined
  "account.confirm.deleteFinish": undefined
  "account.confirm.deleteConfirm": undefined
  "account.confirm.deleteFinishConfirm": undefined
  "account.confirm.cancel": undefined
  "dashboard.badge.blueprint": undefined
  "dashboard.badge.github": undefined
  "dashboard.hero.lead": undefined
  "dashboard.hero.emphasis": undefined
  "dashboard.hero.body": undefined
  "dashboard.resume": { title: string }
  "dashboard.start": undefined
  "dashboard.studyPath": undefined
  "dashboard.saved.guest": undefined
  "dashboard.saved.account": undefined
  "dashboard.blueprint.eyebrow": undefined
  "dashboard.blueprint.title": undefined
  "dashboard.reviewAnswers": undefined
  "dashboard.examWeight": undefined
  "dashboard.domainLabel": { number: string }
  "dashboard.questions": { count: number }
  "dashboard.practice": undefined
  "dashboard.readiness.eyebrow": undefined
  "dashboard.readiness.subtitle": undefined
  "dashboard.readiness.aria": { score: number }
  "dashboard.readiness.overall": undefined
  "dashboard.readiness.answered": undefined
  "dashboard.readiness.best": undefined
  "setup.eyebrow": undefined
  "setup.title": undefined
  "setup.body": undefined
  "setup.full.eyebrow": undefined
  "setup.full.title": undefined
  "setup.full.description": undefined
  "setup.full.meta": undefined
  "setup.quick.eyebrow": undefined
  "setup.quick.title": undefined
  "setup.quick.description": undefined
  "setup.quick.meta": undefined
  "setup.quick.metaSelected": undefined
  "setup.domain.eyebrow": undefined
  "setup.domain.title": undefined
  "setup.domain.description": undefined
  "setup.domain.meta": { count: number }
  "setup.domain.select": undefined
  "setup.domains.title": undefined
  "setup.domains.description": undefined
  "setup.examNote.label": undefined
  "setup.examNote.body": undefined
  "setup.begin": undefined
  "attempt.full": undefined
  "attempt.quick": undefined
  "attempt.domain": { short: string }
  "attempt.focused": { count: number }
  "exam.questionProgress": { current: number; total: number }
  "exam.pauseTimer": undefined
  "exam.resumeTimer": undefined
  "exam.timerRemaining": { remaining: string }
  "exam.paused": undefined
  "exam.pauseExit": undefined
  "exam.toggleMap": undefined
  "exam.flag": undefined
  "exam.selectMultiple": undefined
  "exam.selectSingle": undefined
  "exam.correct": undefined
  "exam.incorrect": undefined
  "exam.previous": undefined
  "exam.checkAnswer": undefined
  "exam.submit": undefined
  "exam.next": undefined
  "exam.map.title": undefined
  "exam.map.answered": { answered: number; total: number }
  "exam.map.question": { number: number }
  "exam.bookmark": undefined
  "exam.bookmarked": undefined
  "exam.checkHint": undefined
  "exam.domainBadge": { number: string; short: string }
  "results.passingSignal": undefined
  "results.keepBuilding": undefined
  "results.correctOf": { correct: number; total: number; minutes: number }
  "results.eyebrow": undefined
  "results.title.pass": undefined
  "results.title.fail": undefined
  "results.body.pass": undefined
  "results.body.fail": undefined
  "results.retry": undefined
  "results.dashboard": undefined
  "results.performance.eyebrow": undefined
  "results.performance.title": undefined
  "results.openReview": undefined
  "results.correctCount": { correct: number; total: number }
  "results.answerReview.eyebrow": undefined
  "results.answerReview.title": undefined
  "results.questionHeading": { number: number; short: string }
  "results.yourAnswer": undefined
  "results.correctAnswer": undefined
  "results.why": undefined
  "results.noAnswer": undefined
  "results.bookmark": undefined
  "results.bookmarked": undefined
  "outcome.submitted": undefined
  "outcome.expired": undefined
  "outcome.abandoned": undefined
  "review.passing": undefined
  "review.needsReview": undefined
  "review.eyebrow": undefined
  "review.title": undefined
  "review.body": undefined
  "review.filter.missed": { count: number }
  "review.filter.bookmarks": { count: number }
  "review.filter.history": { count: number }
  "review.empty.history.title": undefined
  "review.empty.history.body": undefined
  "review.empty.bookmarks.title": undefined
  "review.empty.bookmarks.body": undefined
  "review.empty.missed.title": undefined
  "review.empty.missed.body": undefined
  "review.start": undefined
  "review.correctLabel": undefined
  "review.toggleBookmark": undefined
  "review.attempt.finishedAt": { finishedAt: number }
  "review.attempt.questionCount": { count: number }
  "resources.eyebrow": undefined
  "resources.title": undefined
  "resources.body": undefined
  "resources.profile.label": undefined
  "resources.profile.body": undefined
  "resources.sequence.eyebrow": undefined
  "resources.sequence.title": undefined
  "resources.cta.title": undefined
  "resources.cta.body": undefined
  "resources.cta.button": undefined
  "resources.step1.title": undefined
  "resources.step1.description": undefined
  "resources.step1.domains": undefined
  "resources.step2.title": undefined
  "resources.step2.description": undefined
  "resources.step2.domains": undefined
  "resources.step3.title": undefined
  "resources.step3.description": undefined
  "resources.step3.domains": undefined
  "resources.step4.title": undefined
  "resources.step4.description": undefined
  "resources.step4.domains": undefined
  "footer.disclaimer": undefined
  "domain.architecture.short": undefined
  "domain.tools.short": undefined
  "domain.memory.short": undefined
  "domain.evaluation.short": undefined
  "domain.orchestration.short": undefined
  "domain.guardrails.short": undefined
}

export type MessageKey = keyof MessageArgs

export type Catalog = {
  [Key in MessageKey]: (
    args: MessageArgs[Key],
    format: Formatters,
  ) => string
}

export const englishCatalog = {
  "document.title": () => "Agentic Ready — GH-600 Practice",
  "document.description": () =>
    "An unofficial, offline-first practice exam for the GitHub Certified: Agentic AI Developer (GH-600) credential.",
  "brand.tagline": () => "GH-600 practice",
  "app.starting": () => "Starting practice…",
  "nav.dashboard": () => "Dashboard",
  "nav.practice": () => "Practice",
  "nav.review": () => "Review",
  "nav.studyPath": () => "Study path",
  "nav.account": () => "Account",
  "nav.primary": () => "Primary navigation",
  "nav.mobile": () => "Mobile navigation",
  "nav.toggle": () => "Toggle navigation",
  "nav.brandHome": () => "Agentic Ready dashboard",
  "nav.startPractice": () => "Start practice",
  "nav.recoveryHint": () =>
    "Sign in again from Account to unlock the rest of the practice tool. Your practice state is protected on this device.",
  "nav.deletionHint": () =>
    "Finish account deletion from Account to unlock the rest of the practice tool. Deleted practice data will not be restored.",
  "account.language.label": () => "Interface language",
  "account.language.helper": () =>
    "Changes controls, status, and guidance in this browser. Practice question content and explanations remain in English. This preference is not synced.",
  "account.language.persistenceFailed": () =>
    "The selected language applies for this visit but could not be saved.",
  "practice.setup.questionBankNotice": () =>
    "Practice questions and explanations remain in English.",
  "sync.status.guest": () => "Saved on this device",
  "sync.status.syncing": () => "Syncing…",
  "sync.status.synced": () => "Synced",
  "sync.status.offline": () => "Offline · saved on this device",
  "sync.status.attention": () => "Not synced · saved on this device",
  "sync.status.signingOut": () => "Signing out…",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Practice state synced ${format.dateTime(acceptedAt)}`,
  "sync.notification.dismiss": () => "Dismiss sync explanation",
  "sync.notification.firstSyncRejected": () =>
    "Your practice state could not be synced to the account, so sign-in was ended. Your guest practice remains saved on this device.",
  "sync.notification.signOutBlocked": () =>
    "Your practice state could not be synced to the account. It remains protected on this device, but sign-out could not finish.",
  "sync.notification.unsupportedSchema": () =>
    "This app version could not sync the latest changes. The last synced practice state has been restored.",
  "sync.notification.tooLarge": () =>
    "The latest changes were too large to sync. The last synced practice state has been restored.",
  "sync.notification.unsupportedMedia": () =>
    "The sync service did not accept the practice-state format. The last synced practice state has been restored.",
  "sync.notification.malformedJson": () =>
    "The sync service could not read the latest changes. The last synced practice state has been restored.",
  "sync.notification.invalidState": () =>
    "The latest changes were not valid. The last synced practice state has been restored.",
  "sync.notification.generic": () =>
    "The latest changes could not be synced. The last synced practice state has been restored.",
  "account.notice.signInCallbackFailed": () =>
    "GitHub sign-in did not finish, so you are still practicing as a guest. Your practice state on this device is unchanged.",
  "account.notice.signInStartFailed": () =>
    "GitHub sign-in could not start. Your guest practice is unchanged. Try again when the service is available.",
  "account.notice.signedOut": () =>
    "You are signed out. This device now has a new empty guest practice state.",
  "account.notice.signOutBlocked": () =>
    "Sign-out is blocked until your practice state can be secured. You remain signed in and no work was discarded.",
  "account.notice.signOutFailed": () =>
    "Sign-out could not finish safely. You remain signed in and no work was discarded.",
  "account.notice.resetGuestCompleted": () =>
    "Practice state was deleted from this browser. You now have a new empty guest practice state.",
  "account.notice.resetAccountCompleted": () =>
    "Practice state was deleted from the server and this device. Your account remains signed in with a new empty practice state.",
  "account.notice.resetFailed": () =>
    "Practice state could not be deleted. Try again; no other subject’s state was changed.",
  "account.notice.deleteCompleted": () =>
    "Your practice data and account were deleted. This device now has a new empty guest practice state.",
  "account.notice.deleteIdentityUnfinished": () =>
    "Your practice data is deleted, but the account identity step did not finish. Retry account deletion to continue from that step.",
  "account.notice.deletePracticeUnfinished": () =>
    "Account deletion stopped before your identity was changed. Your practice state remains available so you can retry safely.",
  "account.notice.deleteFailed": () =>
    "Account deletion could not finish. Retry from Account; completed steps will not restore deleted practice data.",
  "account.eyebrow": () => "Account",
  "account.title.guest": () => "Practice your way.",
  "account.title.reconnect": () => "Reconnect safely.",
  "account.title.signedIn": () => "Practice across devices.",
  "account.intro.guest": () =>
    "Guest practice is permanent and complete. A GitHub account is optional and adds only cross-device sync and recovery after browser data is cleared.",
  "account.intro.reconnect": () =>
    "Your account practice state is protected on this device. Sign in to the same GitHub account to make it available again.",
  "account.intro.signedIn": () =>
    "Your account keeps the practice state on this device and synchronizes it when the service is available.",
  "account.guest.title": () => "Guest practice",
  "account.guest.description": () =>
    "Your practice state is saved only in this browser and remains fully usable offline.",
  "account.sync.title": () => "Sync status",
  "account.sync.description": () =>
    "Edits are saved locally first, then synchronized without blocking practice.",
  "account.sync.statusFor": ({ username }) => `Sync status for @${username}`,
  "account.sync.avatarAlt": ({ username }) => `@${username} GitHub avatar`,
  "account.signIn.title": () => "Optional GitHub sign-in",
  "account.signIn.description": () =>
    "Use GitHub to continue on another device and recover practice after clearing this browser.",
  "account.signIn.againTitle": () => "Sign in again with GitHub",
  "account.signIn.againDescription": () =>
    "Use the same GitHub account so no other subject can see the protected cache.",
  "account.signIn.button": () => "Sign in with GitHub",
  "account.signIn.againButton": () => "Sign in again with GitHub",
  "account.signIn.opening": () => "Opening GitHub…",
  "account.signIn.unavailable": () =>
    "GitHub sign-in is available when the optional full-stack application is running. Guest practice remains available here.",
  "account.signOut.title": () => "Sign out safely",
  "account.signOut.description": () =>
    "Pending practice state must be accepted before sign-out can finish. If syncing is unavailable, sign-out stays blocked and never offers a discard shortcut.",
  "account.signOut.after": () =>
    "After sign-out, this account’s cache is removed from this device and a new empty guest practice state begins.",
  "account.signOut.button": () => "Sign out",
  "account.export.title": () => "Export practice state",
  "account.export.description": () =>
    "Download a client-generated JSON copy of the practice state currently visible here.",
  "account.export.button": () => "Download JSON",
  "account.reset.title": () => "Reset practice state",
  "account.reset.description": () =>
    "Start fresh without changing your sign-in choice.",
  "account.reset.detail": () =>
    "Deletes finished attempts, bookmarks, and latest answers. This cannot be undone.",
  "account.reset.button": () => "Reset practice state",
  "account.delete.title": () => "Delete account",
  "account.delete.finishTitle": () => "Finish deleting account",
  "account.delete.description": () =>
    "Permanently remove both your practice state and signed-in identity.",
  "account.delete.finishDescription": () =>
    "Practice data is deleted. The unfinished identity step can be retried safely without restoring it.",
  "account.delete.detail": () =>
    "Practice state is deleted first. Your account for this practice app is deleted only after that succeeds. Your GitHub account itself is not changed.",
  "account.delete.button": () => "Delete account",
  "account.delete.retry": () => "Retry account deletion",
  "account.delete.deleting": () => "Deleting…",
  "account.confirm.resetTitle": () => "Delete practice state and start fresh?",
  "account.confirm.resetGuest": () =>
    "This permanently deletes your finished attempts, bookmarks, and latest answers only from this browser.",
  "account.confirm.resetAccount": () =>
    "This permanently deletes your finished attempts, bookmarks, and latest answers from the server and this device. It keeps your sign-in and your account for this practice app.",
  "account.confirm.resetConfirm": () => "Delete practice data",
  "account.confirm.deleteTitle": () => "Permanently delete your account?",
  "account.confirm.deleteFinishTitle": () => "Finish deleting your account?",
  "account.confirm.delete": () =>
    "This permanently deletes your finished attempts, bookmarks, and latest answers. Practice state is deleted first. Your account for this practice app is deleted only after that succeeds. Your GitHub account itself is not changed.",
  "account.confirm.deleteFinish": () =>
    "Your finished attempts, bookmarks, and latest answers are already deleted. Retrying now deletes only the unfinished account identity for this practice app. Your GitHub account itself is not changed.",
  "account.confirm.deleteConfirm": () => "Delete practice data and account",
  "account.confirm.deleteFinishConfirm": () => "Finish deleting account",
  "account.confirm.cancel": () => "Cancel",
  "dashboard.badge.blueprint": () => "Built for the current GH-600 blueprint",
  "dashboard.badge.github": () => "View on GitHub",
  "dashboard.hero.lead": () => "Practice the judgment behind",
  "dashboard.hero.emphasis": () => "agentic systems.",
  "dashboard.hero.body": () =>
    "Scenario-based drills for operating, supervising, evaluating, and governing AI agents with GitHub as the control plane.",
  "dashboard.resume": ({ title }) => `Resume ${title}`,
  "dashboard.start": () => "Start a practice exam",
  "dashboard.studyPath": () => "View study path",
  "dashboard.saved.guest": () => "Unofficial practice tool · your practice state stays in this browser",
  "dashboard.saved.account": () => "Unofficial practice tool · saved locally first and synced when connected",
  "dashboard.blueprint.eyebrow": () => "Exam blueprint",
  "dashboard.blueprint.title": () => "Know where you stand in every domain.",
  "dashboard.reviewAnswers": () => "Review past answers",
  "dashboard.examWeight": () => "exam weight",
  "dashboard.domainLabel": ({ number }) => `Domain ${number}`,
  "dashboard.questions": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "question" : "questions"}`,
  "dashboard.practice": () => "Practice",
  "dashboard.readiness.eyebrow": () => "Readiness signal",
  "dashboard.readiness.subtitle": () => "Across the full question bank",
  "dashboard.readiness.aria": ({ score }, format) =>
    `${format.percent(score)} readiness`,
  "dashboard.readiness.overall": () => "overall",
  "dashboard.readiness.answered": () => "questions answered",
  "dashboard.readiness.best": () => "best attempt",
  "setup.eyebrow": () => "Practice modes",
  "setup.title": () => "Choose the kind of pressure you need.",
  "setup.body": () =>
    "Every mode uses the same local question bank. Answers are recorded automatically, so you can leave and resume.",
  "setup.full.eyebrow": () => "Best simulation",
  "setup.full.title": () => "Full practice exam",
  "setup.full.description": () =>
    "30 weighted questions across all six domains. Timed and scored after submission.",
  "setup.full.meta": () => "45 min · 30 questions",
  "setup.quick.eyebrow": () => "Build momentum",
  "setup.quick.title": () => "Quick knowledge check",
  "setup.quick.description": () =>
    "A random set for a fast confidence check between study sessions. Limited to your selected domains when any are chosen.",
  "setup.quick.meta": () => "15 min · 10 questions",
  "setup.quick.metaSelected": () => "15 min · up to 10 questions from selected domains",
  "setup.domain.eyebrow": () => "Close a gap",
  "setup.domain.title": () => "Focused domain drill",
  "setup.domain.description": () =>
    "Practice every question available in the blueprint domains you select.",
  "setup.domain.meta": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "question" : "questions"} · adaptive time`,
  "setup.domain.select": () => "Select at least one domain below",
  "setup.domains.title": () => "Domains for focused practice",
  "setup.domains.description": () =>
    "Click to select one or more areas. Double-click to unselect.",
  "setup.examNote.label": () => "Exam note:",
  "setup.examNote.body": () =>
    "This is an original, unofficial question bank based on the published skills outline and linked documentation—not Microsoft exam content or a prediction of exact questions.",
  "setup.begin": () => "Begin",
  "attempt.full": () => "Full practice exam",
  "attempt.quick": () => "Quick knowledge check",
  "attempt.domain": ({ short }) => `${short} drill`,
  "attempt.focused": ({ count }, format) =>
    `Focused drill · ${format.integer(count)} ${count === 1 ? "domain" : "domains"}`,
  "exam.questionProgress": ({ current, total }, format) =>
    `Question ${format.integer(current)} of ${format.integer(total)}`,
  "exam.pauseTimer": () => "Pause timer",
  "exam.resumeTimer": () => "Resume timer",
  "exam.timerRemaining": ({ remaining }) => `${remaining} remaining`,
  "exam.paused": () => "Paused",
  "exam.pauseExit": () => "Pause & exit",
  "exam.toggleMap": () => "Toggle question map",
  "exam.flag": () => "Flag",
  "exam.selectMultiple": () => "Select all that apply.",
  "exam.selectSingle": () => "Select the best answer.",
  "exam.correct": () => "Correct",
  "exam.incorrect": () => "Not quite",
  "exam.previous": () => "Previous",
  "exam.checkAnswer": () => "Check answer",
  "exam.submit": () => "Submit attempt",
  "exam.next": () => "Next question",
  "exam.map.title": () => "Question map",
  "exam.map.answered": ({ answered, total }, format) =>
    `${format.integer(answered)} of ${format.integer(total)} answered`,
  "exam.map.question": ({ number }, format) => `Question ${format.integer(number)}:`,
  "exam.bookmark": () => "Bookmark this question",
  "exam.bookmarked": () => "Bookmarked",
  "exam.checkHint": () =>
    "Select an answer, then check it to see the correct answer and explanation.",
  "exam.domainBadge": ({ number, short }) => `Domain ${number} · ${short}`,
  "results.passingSignal": () => "Passing signal",
  "results.keepBuilding": () => "Keep building",
  "results.correctOf": ({ correct, total, minutes }, format) =>
    `${format.integer(correct)} of ${format.integer(total)} correct · ${format.integer(minutes)} min`,
  "results.eyebrow": () => "Attempt finished",
  "results.title.pass": () => "Strong work. Your controls held.",
  "results.title.fail": () => "You found the edges. Now tune them.",
  "results.body.pass": () =>
    "You cleared the 70% practice threshold. Review domain signals before the next full simulation.",
  "results.body.fail": () =>
    "Use the explanations below to separate guidance, evidence, and enforceable controls—the distinction behind many scenarios.",
  "results.retry": () => "Try another set",
  "results.dashboard": () => "Back to dashboard",
  "results.performance.eyebrow": () => "Performance",
  "results.performance.title": () => "Domain breakdown",
  "results.openReview": () => "Open review queue",
  "results.correctCount": ({ correct, total }, format) =>
    `${format.integer(correct)}/${format.integer(total)} correct`,
  "results.answerReview.eyebrow": () => "Answer review",
  "results.answerReview.title": () => "Learn from every decision.",
  "results.questionHeading": ({ number, short }, format) =>
    `Question ${format.integer(number)} · ${short}`,
  "results.yourAnswer": () => "Your answer",
  "results.correctAnswer": () => "Correct answer",
  "results.why": () => "Why",
  "results.noAnswer": () => "No answer",
  "results.bookmark": () => "Bookmark",
  "results.bookmarked": () => "Bookmarked",
  "outcome.submitted": () => "Submitted",
  "outcome.expired": () => "Expired",
  "outcome.abandoned": () => "Abandoned",
  "review.passing": () => "Passing",
  "review.needsReview": () => "Review",
  "review.eyebrow": () => "Review center",
  "review.title": () => "Turn misses into durable knowledge.",
  "review.body": () =>
    "Revisit incorrect and bookmarked scenarios, or inspect your recent finished attempts. The queue is assembled from this browser's practice history.",
  "review.filter.missed": ({ count }, format) => `Missed (${format.integer(count)})`,
  "review.filter.bookmarks": ({ count }, format) => `Bookmarks (${format.integer(count)})`,
  "review.filter.history": ({ count }, format) => `History (${format.integer(count)})`,
  "review.empty.history.title": () => "No finished attempts yet",
  "review.empty.history.body": () =>
    "Finish a practice attempt and your scores will appear here.",
  "review.empty.bookmarks.title": () => "No bookmarks yet",
  "review.empty.bookmarks.body": () =>
    "Bookmark questions during an attempt or from a finished attempt.",
  "review.empty.missed.title": () => "No missed questions yet",
  "review.empty.missed.body": () => "Start a practice set to build your review queue.",
  "review.start": () => "Start practice",
  "review.correctLabel": () => "Correct:",
  "review.toggleBookmark": () => "Toggle bookmark",
  "review.attempt.finishedAt": ({ finishedAt }, format) => format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "question" : "questions"}`,
  "resources.eyebrow": () => "GH-600 study path",
  "resources.title": () => "Learn the blueprint. Practice the decisions.",
  "resources.body": () =>
    "Follow a focused route through the official learning material, then use practice modes and answer review to strengthen each exam domain.",
  "resources.profile.label": () => "Published exam profile:",
  "resources.profile.body": () =>
    "expertise operating, integrating, supervising, and governing agents in production-grade SDLC workflows, with GitHub as the system of record and control plane.",
  "resources.sequence.eyebrow": () => "Recommended sequence",
  "resources.sequence.title": () => "A focused route through the material.",
  "resources.cta.title": () => "Ready to test the first pass?",
  "resources.cta.body": () =>
    "Use a full exam to establish your baseline, then alternate focused drills with answer review.",
  "resources.cta.button": () => "Choose a practice mode",
  "resources.step1.title": () => "Establish the agentic foundation",
  "resources.step1.description": () =>
    "Learn the plan–act–evaluate lifecycle, GitHub-native accountability, task boundaries, and the difference between guidance and policy.",
  "resources.step1.domains": () => "Domains 1 & 6",
  "resources.step2.title": () => "Design the architecture and SDLC",
  "resources.step2.description": () =>
    "Practice structured plans, autonomy levels, PR governance, observability, Actions handoffs, and recovery paths.",
  "resources.step2.domains": () => "Domains 1, 4 & 5",
  "resources.step3.title": () => "Configure tools, MCP, and execution",
  "resources.step3.description": () =>
    "Work through custom agents, tool scope, MCP servers, allowlists, cloud setup, CLI automation, credentials, and firewalls.",
  "resources.step3.domains": () => "Domain 2",
  "resources.step4.title": () => "Evaluate, govern, and recover",
  "resources.step4.description": () =>
    "Use tests, scans, logs, artifacts, session state, rulesets, hooks, approvals, and audit events as evidence and controls.",
  "resources.step4.domains": () => "Domains 3–6",
  "footer.disclaimer": () =>
    "Unofficial study aid. Not affiliated with or endorsed by Microsoft or GitHub. GH-600, GitHub, and Copilot are trademarks of their respective owners.",
  "domain.architecture.short": () => "Architecture & SDLC",
  "domain.tools.short": () => "Tools & environments",
  "domain.memory.short": () => "Memory & state",
  "domain.evaluation.short": () => "Evaluation & tuning",
  "domain.orchestration.short": () => "Multi-agent",
  "domain.guardrails.short": () => "Guardrails",
} satisfies Catalog

export const spanishCatalog = {
  "document.title": () => "Agentic Ready — Práctica GH-600",
  "document.description": () =>
    "Un examen de práctica extraoficial, pensado para funcionar sin conexión, para la credencial GitHub Certified: Agentic AI Developer (GH-600).",
  "brand.tagline": () => "Práctica GH-600",
  "app.starting": () => "Iniciando la práctica…",
  "nav.dashboard": () => "Panel",
  "nav.practice": () => "Práctica",
  "nav.review": () => "Repaso",
  "nav.studyPath": () => "Ruta de estudio",
  "nav.account": () => "Cuenta",
  "nav.primary": () => "Navegación principal",
  "nav.mobile": () => "Navegación móvil",
  "nav.toggle": () => "Mostrar u ocultar la navegación",
  "nav.brandHome": () => "Panel de Agentic Ready",
  "nav.startPractice": () => "Empezar a practicar",
  "nav.recoveryHint": () =>
    "Vuelve a iniciar sesión desde Cuenta para desbloquear el resto de la herramienta de práctica. Tus datos de práctica están protegidos en este dispositivo.",
  "nav.deletionHint": () =>
    "Termina de eliminar la cuenta desde Cuenta para desbloquear el resto de la herramienta de práctica. Los datos de práctica eliminados no se restaurarán.",
  "account.language.label": () => "Idioma de la interfaz",
  "account.language.helper": () =>
    "Cambia los controles, el estado y la orientación en este navegador. El contenido y las explicaciones de las preguntas de práctica permanecen en inglés. Esta preferencia no se sincroniza.",
  "account.language.persistenceFailed": () =>
    "El idioma seleccionado se aplica en esta visita, pero no se pudo guardar.",
  "practice.setup.questionBankNotice": () =>
    "Las preguntas de práctica y las explicaciones permanecen en inglés.",
  "sync.status.guest": () => "Guardado en este dispositivo",
  "sync.status.syncing": () => "Sincronizando…",
  "sync.status.synced": () => "Sincronizado",
  "sync.status.offline": () => "Sin conexión · guardado en este dispositivo",
  "sync.status.attention": () => "No sincronizado · guardado en este dispositivo",
  "sync.status.signingOut": () => "Cerrando sesión…",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Datos de práctica sincronizados el ${format.dateTime(acceptedAt)}`,
  "sync.notification.dismiss": () => "Cerrar la explicación de sincronización",
  "sync.notification.firstSyncRejected": () =>
    "No se pudieron sincronizar tus datos de práctica con la cuenta, así que se cerró la sesión. Tu práctica de invitado sigue guardada en este dispositivo.",
  "sync.notification.signOutBlocked": () =>
    "No se pudieron sincronizar tus datos de práctica con la cuenta. Siguen protegidos en este dispositivo, pero no se pudo cerrar la sesión.",
  "sync.notification.unsupportedSchema": () =>
    "Esta versión de la aplicación no pudo sincronizar los últimos cambios. Se restauraron los últimos datos de práctica sincronizados.",
  "sync.notification.tooLarge": () =>
    "Los últimos cambios eran demasiado grandes para sincronizarlos. Se restauraron los últimos datos de práctica sincronizados.",
  "sync.notification.unsupportedMedia": () =>
    "El servicio de sincronización no aceptó el formato de los datos de práctica. Se restauraron los últimos datos de práctica sincronizados.",
  "sync.notification.malformedJson": () =>
    "El servicio de sincronización no pudo leer los últimos cambios. Se restauraron los últimos datos de práctica sincronizados.",
  "sync.notification.invalidState": () =>
    "Los últimos cambios no eran válidos. Se restauraron los últimos datos de práctica sincronizados.",
  "sync.notification.generic": () =>
    "No se pudieron sincronizar los últimos cambios. Se restauraron los últimos datos de práctica sincronizados.",
  "account.notice.signInCallbackFailed": () =>
    "El inicio de sesión con GitHub no terminó, así que sigues practicando como invitado. Tus datos de práctica en este dispositivo no cambiaron.",
  "account.notice.signInStartFailed": () =>
    "No se pudo iniciar sesión con GitHub. Tu práctica de invitado no cambió. Inténtalo de nuevo cuando el servicio esté disponible.",
  "account.notice.signedOut": () =>
    "Cerraste sesión. Este dispositivo ahora tiene un nuevo estado de práctica de invitado vacío.",
  "account.notice.signOutBlocked": () =>
    "El cierre de sesión está bloqueado hasta que se puedan proteger tus datos de práctica. Sigues con sesión iniciada y no se descartó ningún trabajo.",
  "account.notice.signOutFailed": () =>
    "El cierre de sesión no pudo terminar de forma segura. Sigues con sesión iniciada y no se descartó ningún trabajo.",
  "account.notice.resetGuestCompleted": () =>
    "Se eliminaron los datos de práctica de este navegador. Ahora tienes un nuevo estado de práctica de invitado vacío.",
  "account.notice.resetAccountCompleted": () =>
    "Se eliminaron los datos de práctica del servidor y de este dispositivo. Tu cuenta sigue con sesión iniciada y un nuevo estado de práctica vacío.",
  "account.notice.resetFailed": () =>
    "No se pudieron eliminar los datos de práctica. Inténtalo de nuevo; no se cambió el estado de ningún otro sujeto.",
  "account.notice.deleteCompleted": () =>
    "Se eliminaron tus datos de práctica y tu cuenta. Este dispositivo ahora tiene un nuevo estado de práctica de invitado vacío.",
  "account.notice.deleteIdentityUnfinished": () =>
    "Tus datos de práctica están eliminados, pero el paso de identidad de la cuenta no terminó. Reintenta la eliminación de la cuenta para continuar desde ese paso.",
  "account.notice.deletePracticeUnfinished": () =>
    "La eliminación de la cuenta se detuvo antes de cambiar tu identidad. Tus datos de práctica siguen disponibles para que puedas reintentarlo con seguridad.",
  "account.notice.deleteFailed": () =>
    "La eliminación de la cuenta no pudo terminar. Reintenta desde Cuenta; los pasos completados no restaurarán los datos de práctica eliminados.",
  "account.eyebrow": () => "Cuenta",
  "account.title.guest": () => "Practica a tu manera.",
  "account.title.reconnect": () => "Vuelve a conectar con seguridad.",
  "account.title.signedIn": () => "Practica en varios dispositivos.",
  "account.intro.guest": () =>
    "La práctica de invitado es permanente y completa. Una cuenta de GitHub es opcional y solo añade sincronización entre dispositivos y recuperación después de borrar los datos del navegador.",
  "account.intro.reconnect": () =>
    "Los datos de práctica de tu cuenta están protegidos en este dispositivo. Inicia sesión con la misma cuenta de GitHub para volver a tenerlos disponibles.",
  "account.intro.signedIn": () =>
    "Tu cuenta guarda los datos de práctica en este dispositivo y los sincroniza cuando el servicio está disponible.",
  "account.guest.title": () => "Práctica de invitado",
  "account.guest.description": () =>
    "Tus datos de práctica se guardan solo en este navegador y siguen siendo plenamente utilizables sin conexión.",
  "account.sync.title": () => "Estado de sincronización",
  "account.sync.description": () =>
    "Las ediciones se guardan primero en local y luego se sincronizan sin bloquear la práctica.",
  "account.sync.statusFor": ({ username }) => `Estado de sincronización de @${username}`,
  "account.sync.avatarAlt": ({ username }) => `Avatar de GitHub de @${username}`,
  "account.signIn.title": () => "Inicio de sesión opcional con GitHub",
  "account.signIn.description": () =>
    "Usa GitHub para continuar en otro dispositivo y recuperar la práctica después de borrar este navegador.",
  "account.signIn.againTitle": () => "Vuelve a iniciar sesión con GitHub",
  "account.signIn.againDescription": () =>
    "Usa la misma cuenta de GitHub para que ningún otro sujeto pueda ver la caché protegida.",
  "account.signIn.button": () => "Iniciar sesión con GitHub",
  "account.signIn.againButton": () => "Volver a iniciar sesión con GitHub",
  "account.signIn.opening": () => "Abriendo GitHub…",
  "account.signIn.unavailable": () =>
    "El inicio de sesión con GitHub está disponible cuando se ejecuta la aplicación full-stack opcional. La práctica de invitado sigue disponible aquí.",
  "account.signOut.title": () => "Cerrar sesión con seguridad",
  "account.signOut.description": () =>
    "Los datos de práctica pendientes deben aceptarse antes de que el cierre de sesión pueda terminar. Si la sincronización no está disponible, el cierre de sesión permanece bloqueado y nunca ofrece un atajo para descartar.",
  "account.signOut.after": () =>
    "Después de cerrar sesión, la caché de esta cuenta se elimina de este dispositivo y comienza un nuevo estado de práctica de invitado vacío.",
  "account.signOut.button": () => "Cerrar sesión",
  "account.export.title": () => "Exportar datos de práctica",
  "account.export.description": () =>
    "Descarga una copia JSON generada en el cliente de los datos de práctica visibles ahora.",
  "account.export.button": () => "Descargar JSON",
  "account.reset.title": () => "Restablecer datos de práctica",
  "account.reset.description": () =>
    "Empieza de cero sin cambiar tu elección de inicio de sesión.",
  "account.reset.detail": () =>
    "Elimina los intentos finalizados, los marcadores y las respuestas más recientes. Esto no se puede deshacer.",
  "account.reset.button": () => "Restablecer datos de práctica",
  "account.delete.title": () => "Eliminar cuenta",
  "account.delete.finishTitle": () => "Terminar de eliminar la cuenta",
  "account.delete.description": () =>
    "Elimina de forma permanente tus datos de práctica y tu identidad con sesión iniciada.",
  "account.delete.finishDescription": () =>
    "Los datos de práctica están eliminados. El paso de identidad sin terminar se puede reintentar con seguridad sin restaurarlos.",
  "account.delete.detail": () =>
    "Primero se eliminan los datos de práctica. Tu cuenta de esta aplicación de práctica se elimina solo después de que eso se complete. Tu cuenta de GitHub no cambia.",
  "account.delete.button": () => "Eliminar cuenta",
  "account.delete.retry": () => "Reintentar la eliminación de la cuenta",
  "account.delete.deleting": () => "Eliminando…",
  "account.confirm.resetTitle": () => "¿Eliminar los datos de práctica y empezar de cero?",
  "account.confirm.resetGuest": () =>
    "Esto elimina de forma permanente tus intentos finalizados, marcadores y respuestas más recientes solo de este navegador.",
  "account.confirm.resetAccount": () =>
    "Esto elimina de forma permanente tus intentos finalizados, marcadores y respuestas más recientes del servidor y de este dispositivo. Conserva tu inicio de sesión y tu cuenta de esta aplicación de práctica.",
  "account.confirm.resetConfirm": () => "Eliminar datos de práctica",
  "account.confirm.deleteTitle": () => "¿Eliminar tu cuenta de forma permanente?",
  "account.confirm.deleteFinishTitle": () => "¿Terminar de eliminar tu cuenta?",
  "account.confirm.delete": () =>
    "Esto elimina de forma permanente tus intentos finalizados, marcadores y respuestas más recientes. Primero se eliminan los datos de práctica. Tu cuenta de esta aplicación de práctica se elimina solo después de que eso se complete. Tu cuenta de GitHub no cambia.",
  "account.confirm.deleteFinish": () =>
    "Tus intentos finalizados, marcadores y respuestas más recientes ya están eliminados. Reintentar ahora elimina solo la identidad de cuenta sin terminar de esta aplicación de práctica. Tu cuenta de GitHub no cambia.",
  "account.confirm.deleteConfirm": () => "Eliminar datos de práctica y cuenta",
  "account.confirm.deleteFinishConfirm": () => "Terminar de eliminar la cuenta",
  "account.confirm.cancel": () => "Cancelar",
  "dashboard.badge.blueprint": () => "Hecho para el esquema actual de GH-600",
  "dashboard.badge.github": () => "Ver en GitHub",
  "dashboard.hero.lead": () => "Practica el criterio detrás de los",
  "dashboard.hero.emphasis": () => "sistemas agénticos.",
  "dashboard.hero.body": () =>
    "Ejercicios basados en escenarios para operar, supervisar, evaluar y gobernar agentes de IA con GitHub como plano de control.",
  "dashboard.resume": ({ title }) => `Reanudar ${title}`,
  "dashboard.start": () => "Empezar un examen de práctica",
  "dashboard.studyPath": () => "Ver la ruta de estudio",
  "dashboard.saved.guest": () => "Herramienta de práctica extraoficial · tus datos de práctica permanecen en este navegador",
  "dashboard.saved.account": () => "Herramienta de práctica extraoficial · se guarda primero en local y se sincroniza al conectar",
  "dashboard.blueprint.eyebrow": () => "Esquema del examen",
  "dashboard.blueprint.title": () => "Sabe en qué punto estás en cada dominio.",
  "dashboard.reviewAnswers": () => "Repasar respuestas anteriores",
  "dashboard.examWeight": () => "peso del examen",
  "dashboard.domainLabel": ({ number }) => `Dominio ${number}`,
  "dashboard.questions": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "pregunta" : "preguntas"}`,
  "dashboard.practice": () => "Practicar",
  "dashboard.readiness.eyebrow": () => "Señal de preparación",
  "dashboard.readiness.subtitle": () => "En todo el banco de preguntas",
  "dashboard.readiness.aria": ({ score }, format) =>
    `nivel de preparación ${format.percent(score)}`,
  "dashboard.readiness.overall": () => "general",
  "dashboard.readiness.answered": () => "preguntas respondidas",
  "dashboard.readiness.best": () => "mejor intento",
  "setup.eyebrow": () => "Modos de práctica",
  "setup.title": () => "Elige el tipo de presión que necesitas.",
  "setup.body": () =>
    "Cada modo usa el mismo banco de preguntas local. Las respuestas se registran automáticamente, así que puedes salir y reanudar.",
  "setup.full.eyebrow": () => "Mejor simulación",
  "setup.full.title": () => "Examen de práctica completo",
  "setup.full.description": () =>
    "30 preguntas ponderadas en los seis dominios. Con tiempo y puntuación después de enviarlo.",
  "setup.full.meta": () => "45 min · 30 preguntas",
  "setup.quick.eyebrow": () => "Coge ritmo",
  "setup.quick.title": () => "Comprobación rápida",
  "setup.quick.description": () =>
    "Un conjunto aleatorio para una comprobación rápida de confianza entre sesiones de estudio. Se limita a los dominios seleccionados cuando hay alguno.",
  "setup.quick.meta": () => "15 min · 10 preguntas",
  "setup.quick.metaSelected": () => "15 min · hasta 10 preguntas de los dominios seleccionados",
  "setup.domain.eyebrow": () => "Cierra una brecha",
  "setup.domain.title": () => "Ejercicio de dominio enfocado",
  "setup.domain.description": () =>
    "Practica todas las preguntas disponibles en los dominios del esquema que selecciones.",
  "setup.domain.meta": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "pregunta" : "preguntas"} · tiempo adaptativo`,
  "setup.domain.select": () => "Selecciona al menos un dominio abajo",
  "setup.domains.title": () => "Dominios para la práctica enfocada",
  "setup.domains.description": () =>
    "Haz clic para seleccionar una o más áreas. Haz doble clic para quitar la selección.",
  "setup.examNote.label": () => "Nota sobre el examen:",
  "setup.examNote.body": () =>
    "Este es un banco de preguntas original y extraoficial basado en el esquema de habilidades publicado y en la documentación enlazada; no es contenido del examen de Microsoft ni una predicción de preguntas exactas.",
  "setup.begin": () => "Empezar",
  "attempt.full": () => "Examen de práctica completo",
  "attempt.quick": () => "Comprobación rápida",
  "attempt.domain": ({ short }) => `Ejercicio de ${short}`,
  "attempt.focused": ({ count }, format) =>
    `Ejercicio enfocado · ${format.integer(count)} ${count === 1 ? "dominio" : "dominios"}`,
  "exam.questionProgress": ({ current, total }, format) =>
    `Pregunta ${format.integer(current)} de ${format.integer(total)}`,
  "exam.pauseTimer": () => "Pausar temporizador",
  "exam.resumeTimer": () => "Reanudar temporizador",
  "exam.timerRemaining": ({ remaining }) => `${remaining} restantes`,
  "exam.paused": () => "En pausa",
  "exam.pauseExit": () => "Pausar y salir",
  "exam.toggleMap": () => "Mostrar u ocultar el mapa de preguntas",
  "exam.flag": () => "Marcar",
  "exam.selectMultiple": () => "Selecciona todas las que correspondan.",
  "exam.selectSingle": () => "Selecciona la mejor respuesta.",
  "exam.correct": () => "Correcto",
  "exam.incorrect": () => "No del todo",
  "exam.previous": () => "Anterior",
  "exam.checkAnswer": () => "Comprobar respuesta",
  "exam.submit": () => "Enviar intento",
  "exam.next": () => "Pregunta siguiente",
  "exam.map.title": () => "Mapa de preguntas",
  "exam.map.answered": ({ answered, total }, format) =>
    `${format.integer(answered)} de ${format.integer(total)} respondidas`,
  "exam.map.question": ({ number }, format) => `Pregunta ${format.integer(number)}:`,
  "exam.bookmark": () => "Guardar esta pregunta en marcadores",
  "exam.bookmarked": () => "En marcadores",
  "exam.checkHint": () =>
    "Selecciona una respuesta y compruébala para ver la respuesta correcta y la explicación.",
  "exam.domainBadge": ({ number, short }) => `Dominio ${number} · ${short}`,
  "results.passingSignal": () => "Señal de aprobado",
  "results.keepBuilding": () => "Sigue avanzando",
  "results.correctOf": ({ correct, total, minutes }, format) =>
    `${format.integer(correct)} de ${format.integer(total)} correctas · ${format.integer(minutes)} min`,
  "results.eyebrow": () => "Intento finalizado",
  "results.title.pass": () => "Buen trabajo. Tus controles se sostuvieron.",
  "results.title.fail": () => "Encontraste los límites. Ahora ajústalos.",
  "results.body.pass": () =>
    "Superaste el umbral de práctica del 70 %. Revisa las señales de cada dominio antes de la siguiente simulación completa.",
  "results.body.fail": () =>
    "Usa las explicaciones siguientes para separar orientación, evidencia y controles exigibles: la distinción detrás de muchos escenarios.",
  "results.retry": () => "Probar otro conjunto",
  "results.dashboard": () => "Volver al panel",
  "results.performance.eyebrow": () => "Rendimiento",
  "results.performance.title": () => "Desglose por dominio",
  "results.openReview": () => "Abrir la cola de repaso",
  "results.correctCount": ({ correct, total }, format) =>
    `${format.integer(correct)}/${format.integer(total)} correctas`,
  "results.answerReview.eyebrow": () => "Repaso de respuestas",
  "results.answerReview.title": () => "Aprende de cada decisión.",
  "results.questionHeading": ({ number, short }, format) =>
    `Pregunta ${format.integer(number)} · ${short}`,
  "results.yourAnswer": () => "Tu respuesta",
  "results.correctAnswer": () => "Respuesta correcta",
  "results.why": () => "Por qué",
  "results.noAnswer": () => "Sin respuesta",
  "results.bookmark": () => "Marcador",
  "results.bookmarked": () => "En marcadores",
  "outcome.submitted": () => "Enviado",
  "outcome.expired": () => "Tiempo agotado",
  "outcome.abandoned": () => "Descartado",
  "review.passing": () => "Aprobado",
  "review.needsReview": () => "Repaso",
  "review.eyebrow": () => "Centro de repaso",
  "review.title": () => "Convierte los fallos en conocimiento duradero.",
  "review.body": () =>
    "Revisita escenarios incorrectos y con marcador, o inspecciona tus intentos finalizados recientes. La cola se arma con el historial de práctica de este navegador.",
  "review.filter.missed": ({ count }, format) => `Falladas (${format.integer(count)})`,
  "review.filter.bookmarks": ({ count }, format) => `Marcadores (${format.integer(count)})`,
  "review.filter.history": ({ count }, format) => `Historial (${format.integer(count)})`,
  "review.empty.history.title": () => "Aún no hay intentos finalizados",
  "review.empty.history.body": () =>
    "Termina un intento de práctica y tus puntuaciones aparecerán aquí.",
  "review.empty.bookmarks.title": () => "Aún no hay marcadores",
  "review.empty.bookmarks.body": () =>
    "Guarda preguntas en marcadores durante un intento o desde un intento finalizado.",
  "review.empty.missed.title": () => "Aún no hay preguntas falladas",
  "review.empty.missed.body": () => "Empieza un conjunto de práctica para armar tu cola de repaso.",
  "review.start": () => "Empezar a practicar",
  "review.correctLabel": () => "Correcta:",
  "review.toggleBookmark": () => "Activar o desactivar marcador",
  "review.attempt.finishedAt": ({ finishedAt }, format) => format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "pregunta" : "preguntas"}`,
  "resources.eyebrow": () => "Ruta de estudio GH-600",
  "resources.title": () => "Aprende el esquema. Practica las decisiones.",
  "resources.body": () =>
    "Sigue una ruta enfocada por el material oficial de aprendizaje y luego usa los modos de práctica y el repaso de respuestas para reforzar cada dominio del examen.",
  "resources.profile.label": () => "Perfil publicado del examen:",
  "resources.profile.body": () =>
    "experiencia operando, integrando, supervisando y gobernando agentes en flujos de trabajo SDLC de producción, con GitHub como sistema de registro y plano de control.",
  "resources.sequence.eyebrow": () => "Secuencia recomendada",
  "resources.sequence.title": () => "Una ruta enfocada por el material.",
  "resources.cta.title": () => "¿Listo para probar el primer pase?",
  "resources.cta.body": () =>
    "Usa un examen completo para fijar tu punto de partida y luego alterna ejercicios enfocados con el repaso de respuestas.",
  "resources.cta.button": () => "Elegir un modo de práctica",
  "resources.step1.title": () => "Establece la base agéntica",
  "resources.step1.description": () =>
    "Aprende el ciclo planificar–actuar–evaluar, la rendición de cuentas nativa de GitHub, los límites de las tareas y la diferencia entre orientación y política.",
  "resources.step1.domains": () => "Dominios 1 y 6",
  "resources.step2.title": () => "Diseña la arquitectura y el SDLC",
  "resources.step2.description": () =>
    "Practica planes estructurados, niveles de autonomía, gobernanza de PR, observabilidad, entregas de Actions y rutas de recuperación.",
  "resources.step2.domains": () => "Dominios 1, 4 y 5",
  "resources.step3.title": () => "Configura tools, MCP y la ejecución",
  "resources.step3.description": () =>
    "Trabaja con agentes personalizados, el alcance de las tools, servidores MCP, listas de permitidos, configuración en la nube, automatización CLI, credenciales y firewalls.",
  "resources.step3.domains": () => "Dominio 2",
  "resources.step4.title": () => "Evalúa, gobierna y recupera",
  "resources.step4.description": () =>
    "Usa tests, análisis, registros, artefactos, estado de sesión, rulesets, hooks, aprobaciones y eventos de auditoría como evidencia y controles.",
  "resources.step4.domains": () => "Dominios 3–6",
  "footer.disclaimer": () =>
    "Material de estudio extraoficial. No está afiliado ni respaldado por Microsoft ni GitHub. GH-600, GitHub y Copilot son marcas de sus respectivos propietarios.",
  "domain.architecture.short": () => "Arquitectura y SDLC",
  "domain.tools.short": () => "Herramientas y entornos",
  "domain.memory.short": () => "Memoria y estado",
  "domain.evaluation.short": () => "Evaluación y ajuste",
  "domain.orchestration.short": () => "Multiagente",
  "domain.guardrails.short": () => "Salvaguardas",
} satisfies Catalog

export const germanCatalog = {
  "document.title": () => "Agentic Ready — GH-600-Übung",
  "document.description": () =>
    "Eine inoffizielle, zuerst offline nutzbare Übungsprüfung für die Zertifizierung GitHub Certified: Agentic AI Developer (GH-600).",
  "brand.tagline": () => "GH-600-Übung",
  "app.starting": () => "Übung wird gestartet…",
  "nav.dashboard": () => "Übersicht",
  "nav.practice": () => "Übung",
  "nav.review": () => "Wiederholung",
  "nav.studyPath": () => "Lernpfad",
  "nav.account": () => "Konto",
  "nav.primary": () => "Hauptnavigation",
  "nav.mobile": () => "Mobile Navigation",
  "nav.toggle": () => "Navigation ein- oder ausblenden",
  "nav.brandHome": () => "Agentic Ready Übersicht",
  "nav.startPractice": () => "Übung starten",
  "nav.recoveryHint": () =>
    "Melde dich erneut über Konto an, um den Rest der Übung freizuschalten. Deine Übungsdaten sind auf diesem Gerät geschützt.",
  "nav.deletionHint": () =>
    "Schließe die Kontolöschung über Konto ab, um den Rest der Übung freizuschalten. Gelöschte Übungsdaten werden nicht wiederhergestellt.",
  "account.language.label": () => "Sprache der Oberfläche",
  "account.language.helper": () =>
    "Steuerelemente, Status und Hinweise ändern sich in diesem Browser. Übungsfragen und Erklärungen bleiben auf Englisch. Diese Einstellung wird nicht synchronisiert.",
  "account.language.persistenceFailed": () =>
    "Die ausgewählte Sprache gilt für diesen Besuch, konnte aber nicht gespeichert werden.",
  "practice.setup.questionBankNotice": () =>
    "Übungsfragen und Erklärungen bleiben auf Englisch.",
  "sync.status.guest": () => "Auf diesem Gerät gespeichert",
  "sync.status.syncing": () => "Wird synchronisiert…",
  "sync.status.synced": () => "Synchronisiert",
  "sync.status.offline": () => "Offline · auf diesem Gerät gespeichert",
  "sync.status.attention": () => "Nicht synchronisiert · auf diesem Gerät gespeichert",
  "sync.status.signingOut": () => "Abmeldung läuft…",
  "sync.status.acceptedAt": ({ acceptedAt, now }, format) =>
    format.relative(acceptedAt, now),
  "sync.status.title": ({ acceptedAt }, format) =>
    `Übungsdaten synchronisiert am ${format.dateTime(acceptedAt)}`,
  "sync.notification.dismiss": () => "Synchronisierungshinweis schließen",
  "sync.notification.firstSyncRejected": () =>
    "Deine Übungsdaten konnten nicht mit dem Konto synchronisiert werden, daher wurde die Anmeldung beendet. Deine Gastübung bleibt auf diesem Gerät gespeichert.",
  "sync.notification.signOutBlocked": () =>
    "Deine Übungsdaten konnten nicht mit dem Konto synchronisiert werden. Sie bleiben auf diesem Gerät geschützt, aber die Abmeldung konnte nicht abgeschlossen werden.",
  "sync.notification.unsupportedSchema": () =>
    "Diese App-Version konnte die neuesten Änderungen nicht synchronisieren. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "sync.notification.tooLarge": () =>
    "Die neuesten Änderungen waren zu groß zum Synchronisieren. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "sync.notification.unsupportedMedia": () =>
    "Der Synchronisierungsdienst hat das Format der Übungsdaten nicht akzeptiert. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "sync.notification.malformedJson": () =>
    "Der Synchronisierungsdienst konnte die neuesten Änderungen nicht lesen. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "sync.notification.invalidState": () =>
    "Die neuesten Änderungen waren ungültig. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "sync.notification.generic": () =>
    "Die neuesten Änderungen konnten nicht synchronisiert werden. Die zuletzt synchronisierten Übungsdaten wurden wiederhergestellt.",
  "account.notice.signInCallbackFailed": () =>
    "Die GitHub-Anmeldung wurde nicht abgeschlossen, daher übst du weiter als Gast. Deine Übungsdaten auf diesem Gerät sind unverändert.",
  "account.notice.signInStartFailed": () =>
    "Die GitHub-Anmeldung konnte nicht starten. Deine Gastübung ist unverändert. Versuche es erneut, wenn der Dienst verfügbar ist.",
  "account.notice.signedOut": () =>
    "Du bist abgemeldet. Dieses Gerät hat jetzt einen neuen leeren Gast-Übungsstand.",
  "account.notice.signOutBlocked": () =>
    "Die Abmeldung ist blockiert, bis deine Übungsdaten gesichert werden können. Du bleibst angemeldet und es wurde nichts verworfen.",
  "account.notice.signOutFailed": () =>
    "Die Abmeldung konnte nicht sicher abgeschlossen werden. Du bleibst angemeldet und es wurde nichts verworfen.",
  "account.notice.resetGuestCompleted": () =>
    "Die Übungsdaten wurden aus diesem Browser gelöscht. Du hast jetzt einen neuen leeren Gast-Übungsstand.",
  "account.notice.resetAccountCompleted": () =>
    "Die Übungsdaten wurden vom Server und von diesem Gerät gelöscht. Dein Konto bleibt angemeldet und hat einen neuen leeren Übungsstand.",
  "account.notice.resetFailed": () =>
    "Die Übungsdaten konnten nicht gelöscht werden. Versuche es erneut; der Stand keines anderen Subjekts wurde geändert.",
  "account.notice.deleteCompleted": () =>
    "Deine Übungsdaten und dein Konto wurden gelöscht. Dieses Gerät hat jetzt einen neuen leeren Gast-Übungsstand.",
  "account.notice.deleteIdentityUnfinished": () =>
    "Deine Übungsdaten sind gelöscht, aber der Identitätsschritt des Kontos wurde nicht abgeschlossen. Wiederhole die Kontolöschung, um bei diesem Schritt fortzufahren.",
  "account.notice.deletePracticeUnfinished": () =>
    "Die Kontolöschung wurde gestoppt, bevor deine Identität geändert wurde. Deine Übungsdaten bleiben verfügbar, damit du es sicher erneut versuchen kannst.",
  "account.notice.deleteFailed": () =>
    "Die Kontolöschung konnte nicht abgeschlossen werden. Versuche es erneut über Konto; abgeschlossene Schritte stellen gelöschte Übungsdaten nicht wieder her.",
  "account.eyebrow": () => "Konto",
  "account.title.guest": () => "Übe auf deine Weise.",
  "account.title.reconnect": () => "Sicher wieder verbinden.",
  "account.title.signedIn": () => "Auf mehreren Geräten üben.",
  "account.intro.guest": () =>
    "Die Gastübung ist dauerhaft und vollständig. Ein GitHub-Konto ist optional und fügt nur geräteübergreifende Synchronisierung und Wiederherstellung nach dem Löschen der Browserdaten hinzu.",
  "account.intro.reconnect": () =>
    "Die Übungsdaten deines Kontos sind auf diesem Gerät geschützt. Melde dich mit demselben GitHub-Konto an, um sie wieder verfügbar zu machen.",
  "account.intro.signedIn": () =>
    "Dein Konto behält die Übungsdaten auf diesem Gerät und synchronisiert sie, wenn der Dienst verfügbar ist.",
  "account.guest.title": () => "Gastübung",
  "account.guest.description": () =>
    "Deine Übungsdaten werden nur in diesem Browser gespeichert und bleiben offline vollständig nutzbar.",
  "account.sync.title": () => "Synchronisierungsstatus",
  "account.sync.description": () =>
    "Änderungen werden zuerst lokal gespeichert und dann synchronisiert, ohne die Übung zu blockieren.",
  "account.sync.statusFor": ({ username }) => `Synchronisierungsstatus für @${username}`,
  "account.sync.avatarAlt": ({ username }) => `GitHub-Avatar von @${username}`,
  "account.signIn.title": () => "Optionale GitHub-Anmeldung",
  "account.signIn.description": () =>
    "Nutze GitHub, um auf einem anderen Gerät weiterzumachen und die Übung nach dem Leeren dieses Browsers wiederherzustellen.",
  "account.signIn.againTitle": () => "Erneut mit GitHub anmelden",
  "account.signIn.againDescription": () =>
    "Nutze dasselbe GitHub-Konto, damit kein anderes Subjekt den geschützten Cache sehen kann.",
  "account.signIn.button": () => "Mit GitHub anmelden",
  "account.signIn.againButton": () => "Erneut mit GitHub anmelden",
  "account.signIn.opening": () => "GitHub wird geöffnet…",
  "account.signIn.unavailable": () =>
    "Die GitHub-Anmeldung ist verfügbar, wenn die optionale Full-Stack-Anwendung läuft. Die Gastübung bleibt hier verfügbar.",
  "account.signOut.title": () => "Sicher abmelden",
  "account.signOut.description": () =>
    "Ausstehende Übungsdaten müssen akzeptiert werden, bevor die Abmeldung abgeschlossen werden kann. Ist die Synchronisierung nicht verfügbar, bleibt die Abmeldung blockiert und bietet niemals eine Abkürzung zum Verwerfen.",
  "account.signOut.after": () =>
    "Nach der Abmeldung wird der Cache dieses Kontos von diesem Gerät entfernt und ein neuer leerer Gast-Übungsstand beginnt.",
  "account.signOut.button": () => "Abmelden",
  "account.export.title": () => "Übungsdaten exportieren",
  "account.export.description": () =>
    "Lade eine clientseitig erzeugte JSON-Kopie der hier sichtbaren Übungsdaten herunter.",
  "account.export.button": () => "JSON herunterladen",
  "account.reset.title": () => "Übungsdaten zurücksetzen",
  "account.reset.description": () =>
    "Starte neu, ohne deine Anmeldewahl zu ändern.",
  "account.reset.detail": () =>
    "Löscht abgeschlossene Übungsdurchgänge, Lesezeichen und neueste Antworten. Das kann nicht rückgängig gemacht werden.",
  "account.reset.button": () => "Übungsdaten zurücksetzen",
  "account.delete.title": () => "Konto löschen",
  "account.delete.finishTitle": () => "Kontolöschung abschließen",
  "account.delete.description": () =>
    "Entferne dauerhaft sowohl deine Übungsdaten als auch deine angemeldete Identität.",
  "account.delete.finishDescription": () =>
    "Die Übungsdaten sind gelöscht. Der unvollendete Identitätsschritt kann sicher wiederholt werden, ohne sie wiederherzustellen.",
  "account.delete.detail": () =>
    "Zuerst werden die Übungsdaten gelöscht. Dein Konto für diese Übungs-App wird erst danach gelöscht. Dein GitHub-Konto selbst wird nicht geändert.",
  "account.delete.button": () => "Konto löschen",
  "account.delete.retry": () => "Kontolöschung wiederholen",
  "account.delete.deleting": () => "Wird gelöscht…",
  "account.confirm.resetTitle": () => "Übungsdaten löschen und neu starten?",
  "account.confirm.resetGuest": () =>
    "Das löscht dauerhaft deine abgeschlossenen Übungsdurchgänge, Lesezeichen und neuesten Antworten nur aus diesem Browser.",
  "account.confirm.resetAccount": () =>
    "Das löscht dauerhaft deine abgeschlossenen Übungsdurchgänge, Lesezeichen und neuesten Antworten vom Server und von diesem Gerät. Deine Anmeldung und dein Konto für diese Übungs-App bleiben erhalten.",
  "account.confirm.resetConfirm": () => "Übungsdaten löschen",
  "account.confirm.deleteTitle": () => "Dein Konto dauerhaft löschen?",
  "account.confirm.deleteFinishTitle": () => "Die Löschung deines Kontos abschließen?",
  "account.confirm.delete": () =>
    "Das löscht dauerhaft deine abgeschlossenen Übungsdurchgänge, Lesezeichen und neuesten Antworten. Zuerst werden die Übungsdaten gelöscht. Dein Konto für diese Übungs-App wird erst danach gelöscht. Dein GitHub-Konto selbst wird nicht geändert.",
  "account.confirm.deleteFinish": () =>
    "Deine abgeschlossenen Übungsdurchgänge, Lesezeichen und neuesten Antworten sind bereits gelöscht. Ein erneuter Versuch löscht jetzt nur die unvollendete Kontidentität für diese Übungs-App. Dein GitHub-Konto selbst wird nicht geändert.",
  "account.confirm.deleteConfirm": () => "Übungsdaten und Konto löschen",
  "account.confirm.deleteFinishConfirm": () => "Kontolöschung abschließen",
  "account.confirm.cancel": () => "Abbrechen",
  "dashboard.badge.blueprint": () => "Für den aktuellen GH-600-Blueprint",
  "dashboard.badge.github": () => "Auf GitHub ansehen",
  "dashboard.hero.lead": () => "Trainiere das Urteilsvermögen hinter",
  "dashboard.hero.emphasis": () => "agentischen Systemen.",
  "dashboard.hero.body": () =>
    "Szenariobasierte Übungen zum Betreiben, Beaufsichtigen, Bewerten und Steuern von KI-Agenten mit GitHub als Control Plane.",
  "dashboard.resume": ({ title }) => `${title} fortsetzen`,
  "dashboard.start": () => "Eine Übungsprüfung starten",
  "dashboard.studyPath": () => "Lernpfad ansehen",
  "dashboard.saved.guest": () => "Inoffizielles Übungstool · deine Übungsdaten bleiben in diesem Browser",
  "dashboard.saved.account": () => "Inoffizielles Übungstool · zuerst lokal gespeichert und bei Verbindung synchronisiert",
  "dashboard.blueprint.eyebrow": () => "Prüfungsblueprint",
  "dashboard.blueprint.title": () => "Sieh, wo du in jedem Prüfungsbereich stehst.",
  "dashboard.reviewAnswers": () => "Frühere Antworten wiederholen",
  "dashboard.examWeight": () => "Prüfungsgewicht",
  "dashboard.domainLabel": ({ number }) => `Prüfungsbereich ${number}`,
  "dashboard.questions": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "Frage" : "Fragen"}`,
  "dashboard.practice": () => "Üben",
  "dashboard.readiness.eyebrow": () => "Vorbereitungsstand",
  "dashboard.readiness.subtitle": () => "Über den gesamten Fragenkatalog",
  "dashboard.readiness.aria": ({ score }, format) =>
    `Vorbereitungsstand ${format.percent(score)}`,
  "dashboard.readiness.overall": () => "gesamt",
  "dashboard.readiness.answered": () => "beantwortete Fragen",
  "dashboard.readiness.best": () => "bester Übungsdurchgang",
  "setup.eyebrow": () => "Übungsmodi",
  "setup.title": () => "Wähle den Druck, den du brauchst.",
  "setup.body": () =>
    "Jeder Modus nutzt denselben lokalen Fragenkatalog. Antworten werden automatisch gespeichert, sodass du unterbrechen und fortsetzen kannst.",
  "setup.full.eyebrow": () => "Beste Simulation",
  "setup.full.title": () => "Vollständige Übungsprüfung",
  "setup.full.description": () =>
    "30 gewichtete Fragen über alle sechs Prüfungsbereiche. Mit Zeitlimit und Punktzahl nach dem Einreichen.",
  "setup.full.meta": () => "45 Min. · 30 Fragen",
  "setup.quick.eyebrow": () => "Schwung holen",
  "setup.quick.title": () => "Schneller Wissenscheck",
  "setup.quick.description": () =>
    "Ein zufälliger Satz für eine schnelle Vertrauensprüfung zwischen Lerneinheiten. Beschränkt auf die ausgewählten Prüfungsbereiche, wenn welche gewählt sind.",
  "setup.quick.meta": () => "15 Min. · 10 Fragen",
  "setup.quick.metaSelected": () => "15 Min. · bis zu 10 Fragen aus ausgewählten Prüfungsbereichen",
  "setup.domain.eyebrow": () => "Eine Lücke schließen",
  "setup.domain.title": () => "Fokussierte Bereichsübung",
  "setup.domain.description": () =>
    "Übe jede verfügbare Frage in den Blueprint-Prüfungsbereichen, die du auswählst.",
  "setup.domain.meta": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "Frage" : "Fragen"} · adaptive Zeit`,
  "setup.domain.select": () => "Wähle unten mindestens einen Prüfungsbereich",
  "setup.domains.title": () => "Prüfungsbereiche für fokussierte Übung",
  "setup.domains.description": () =>
    "Klicke, um einen oder mehrere Bereiche auszuwählen. Doppelklick hebt die Auswahl auf.",
  "setup.examNote.label": () => "Hinweis zur Prüfung:",
  "setup.examNote.body": () =>
    "Dies ist ein originaler, inoffizieller Fragenkatalog auf Basis der veröffentlichten Skills-Übersicht und der verlinkten Dokumentation — kein Microsoft-Prüfungsinhalt und keine Vorhersage genauer Fragen.",
  "setup.begin": () => "Starten",
  "attempt.full": () => "Vollständige Übungsprüfung",
  "attempt.quick": () => "Schneller Wissenscheck",
  "attempt.domain": ({ short }) => `${short}-Übung`,
  "attempt.focused": ({ count }, format) =>
    `Fokussierte Übung · ${format.integer(count)} ${count === 1 ? "Prüfungsbereich" : "Prüfungsbereiche"}`,
  "exam.questionProgress": ({ current, total }, format) =>
    `Frage ${format.integer(current)} von ${format.integer(total)}`,
  "exam.pauseTimer": () => "Timer pausieren",
  "exam.resumeTimer": () => "Timer fortsetzen",
  "exam.timerRemaining": ({ remaining }) => `${remaining} verbleibend`,
  "exam.paused": () => "Pausiert",
  "exam.pauseExit": () => "Pausieren und beenden",
  "exam.toggleMap": () => "Fragenkarte ein- oder ausblenden",
  "exam.flag": () => "Markieren",
  "exam.selectMultiple": () => "Wähle alle zutreffenden Antworten.",
  "exam.selectSingle": () => "Wähle die beste Antwort.",
  "exam.correct": () => "Richtig",
  "exam.incorrect": () => "Noch nicht",
  "exam.previous": () => "Zurück",
  "exam.checkAnswer": () => "Antwort prüfen",
  "exam.submit": () => "Übungsdurchgang einreichen",
  "exam.next": () => "Nächste Frage",
  "exam.map.title": () => "Fragenkarte",
  "exam.map.answered": ({ answered, total }, format) =>
    `${format.integer(answered)} von ${format.integer(total)} beantwortet`,
  "exam.map.question": ({ number }, format) => `Frage ${format.integer(number)}:`,
  "exam.bookmark": () => "Diese Frage mit Lesezeichen versehen",
  "exam.bookmarked": () => "Mit Lesezeichen",
  "exam.checkHint": () =>
    "Wähle eine Antwort und prüfe sie, um die richtige Antwort und die Erklärung zu sehen.",
  "exam.domainBadge": ({ number, short }) => `Prüfungsbereich ${number} · ${short}`,
  "results.passingSignal": () => "Bestehenssignal",
  "results.keepBuilding": () => "Weiter aufbauen",
  "results.correctOf": ({ correct, total, minutes }, format) =>
    `${format.integer(correct)} von ${format.integer(total)} richtig · ${format.integer(minutes)} Min.`,
  "results.eyebrow": () => "Übungsdurchgang abgeschlossen",
  "results.title.pass": () => "Starke Arbeit. Deine Kontrollen haben gehalten.",
  "results.title.fail": () => "Du hast die Kanten gefunden. Jetzt justiere sie.",
  "results.body.pass": () =>
    "Du hast die 70-%-Übungsschwelle geschafft. Prüfe die Signale der Prüfungsbereiche vor der nächsten vollständigen Simulation.",
  "results.body.fail": () =>
    "Nutze die Erklärungen unten, um Hinweise, Belege und durchsetzbare Kontrollen zu trennen — die Unterscheidung hinter vielen Szenarien.",
  "results.retry": () => "Einen anderen Satz versuchen",
  "results.dashboard": () => "Zurück zur Übersicht",
  "results.performance.eyebrow": () => "Leistung",
  "results.performance.title": () => "Aufschlüsselung nach Prüfungsbereich",
  "results.openReview": () => "Wiederholungswarteschlange öffnen",
  "results.correctCount": ({ correct, total }, format) =>
    `${format.integer(correct)}/${format.integer(total)} richtig`,
  "results.answerReview.eyebrow": () => "Antwortwiederholung",
  "results.answerReview.title": () => "Lerne aus jeder Entscheidung.",
  "results.questionHeading": ({ number, short }, format) =>
    `Frage ${format.integer(number)} · ${short}`,
  "results.yourAnswer": () => "Deine Antwort",
  "results.correctAnswer": () => "Richtige Antwort",
  "results.why": () => "Warum",
  "results.noAnswer": () => "Keine Antwort",
  "results.bookmark": () => "Lesezeichen",
  "results.bookmarked": () => "Mit Lesezeichen",
  "outcome.submitted": () => "Eingereicht",
  "outcome.expired": () => "Zeit abgelaufen",
  "outcome.abandoned": () => "Verworfen",
  "review.passing": () => "Bestanden",
  "review.needsReview": () => "Wiederholen",
  "review.eyebrow": () => "Wiederholungszentrum",
  "review.title": () => "Mache Fehler zu dauerhaftem Wissen.",
  "review.body": () =>
    "Sieh dir falsche und mit Lesezeichen versehene Szenarien erneut an oder prüfe deine letzten abgeschlossenen Übungsdurchgänge. Die Warteschlange entsteht aus der Übungshistorie dieses Browsers.",
  "review.filter.missed": ({ count }, format) => `Fehler (${format.integer(count)})`,
  "review.filter.bookmarks": ({ count }, format) => `Lesezeichen (${format.integer(count)})`,
  "review.filter.history": ({ count }, format) => `Verlauf (${format.integer(count)})`,
  "review.empty.history.title": () => "Noch keine abgeschlossenen Übungsdurchgänge",
  "review.empty.history.body": () =>
    "Schließe einen Übungsdurchgang ab, dann erscheinen deine Punktzahlen hier.",
  "review.empty.bookmarks.title": () => "Noch keine Lesezeichen",
  "review.empty.bookmarks.body": () =>
    "Setze Lesezeichen während eines Übungsdurchgangs oder aus einem abgeschlossenen Übungsdurchgang.",
  "review.empty.missed.title": () => "Noch keine falschen Fragen",
  "review.empty.missed.body": () =>
    "Starte einen Übungssatz, um deine Wiederholungswarteschlange aufzubauen.",
  "review.start": () => "Übung starten",
  "review.correctLabel": () => "Richtig:",
  "review.toggleBookmark": () => "Lesezeichen umschalten",
  "review.attempt.finishedAt": ({ finishedAt }, format) => format.date(finishedAt),
  "review.attempt.questionCount": ({ count }, format) =>
    `${format.integer(count)} ${count === 1 ? "Frage" : "Fragen"}`,
  "resources.eyebrow": () => "GH-600-Lernpfad",
  "resources.title": () => "Lerne den Blueprint. Übe die Entscheidungen.",
  "resources.body": () =>
    "Folge einer fokussierten Route durch das offizielle Lernmaterial und nutze dann Übungsmodi und Antwortwiederholung, um jeden Prüfungsbereich zu stärken.",
  "resources.profile.label": () => "Veröffentlichtes Prüfungsprofil:",
  "resources.profile.body": () =>
    "Expertise im Betreiben, Integrieren, Beaufsichtigen und Steuern von Agenten in produktionsreifen SDLC-Workflows, mit GitHub als System of Record und Control Plane.",
  "resources.sequence.eyebrow": () => "Empfohlene Reihenfolge",
  "resources.sequence.title": () => "Eine fokussierte Route durch das Material.",
  "resources.cta.title": () => "Bereit für den ersten Durchgang?",
  "resources.cta.body": () =>
    "Nutze eine vollständige Prüfung für deine Baseline und wechsle dann zwischen fokussierten Übungen und der Antwortwiederholung.",
  "resources.cta.button": () => "Einen Übungsmodus wählen",
  "resources.step1.title": () => "Die agentische Grundlage schaffen",
  "resources.step1.description": () =>
    "Lerne den Plan–Act–Evaluate-Lebenszyklus, GitHub-native Verantwortlichkeit, Aufgabengrenzen und den Unterschied zwischen Hinweis und Richtlinie.",
  "resources.step1.domains": () => "Prüfungsbereiche 1 & 6",
  "resources.step2.title": () => "Architektur und SDLC gestalten",
  "resources.step2.description": () =>
    "Übe strukturierte Pläne, Autonomiegrade, PR-Governance, Observability, Actions-Übergaben und Wiederherstellungspfade.",
  "resources.step2.domains": () => "Prüfungsbereiche 1, 4 & 5",
  "resources.step3.title": () => "Tools, MCP und Ausführung konfigurieren",
  "resources.step3.description": () =>
    "Arbeite mit Custom Agents, Tool-Umfang, MCP-Servern, Allowlists, Cloud-Setup, CLI-Automatisierung, Anmeldedaten und Firewalls.",
  "resources.step3.domains": () => "Prüfungsbereich 2",
  "resources.step4.title": () => "Bewerten, steuern und wiederherstellen",
  "resources.step4.description": () =>
    "Nutze Tests, Scans, Logs, Artefakte, Sitzungszustand, Rulesets, Hooks, Freigaben und Audit-Ereignisse als Belege und Kontrollen.",
  "resources.step4.domains": () => "Prüfungsbereiche 3–6",
  "footer.disclaimer": () =>
    "Inoffizielles Lernmaterial. Nicht verbunden mit oder unterstützt von Microsoft oder GitHub. GH-600, GitHub und Copilot sind Marken der jeweiligen Inhaber.",
  "domain.architecture.short": () => "Architektur & SDLC",
  "domain.tools.short": () => "Tools & Umgebungen",
  "domain.memory.short": () => "Speicher & Zustand",
  "domain.evaluation.short": () => "Evaluation & Tuning",
  "domain.orchestration.short": () => "Multi-Agent",
  "domain.guardrails.short": () => "Leitplanken",
} satisfies Catalog
