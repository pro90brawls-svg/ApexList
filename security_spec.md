# ApexList Security Specification (Firestore Rules)

## 1. Data Invariants
- `/users/{userId}` can only be read, created, updated, or deleted by the authenticated owner whose `request.auth.uid == userId`.
- Document creation, updates, and deletion require `request.auth.token.email_verified == true`.
- `list` queries on `/users` are strictly denied (`allow list: if false`) so accounts cannot be enumerated.
- No PII (`email`, `phone`, `address`) is stored in `/users/{userId}` documents.
- `uid` must equal `userId` and `request.auth.uid`, and `role` is locked to `'member'` (immutable).
- `createdAt` and `updatedAt` must equal `request.time` on creation; `createdAt` is immutable on update and `updatedAt` must equal `request.time`.
- All extra/ghost keys are rejected via `hasAll` + `hasOnly` on create and `affectedKeys().hasOnly(...)` on update.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Fail with PERMISSION_DENIED)
1. Unauthenticated read of `/users/userA`
2. Unauthenticated write to `/users/userA`
3. Collection `list` query on `/users` by an authenticated user
4. Cross-user read of `/users/userB` while authenticated as `userA`
5. Create `/users/userA` with `email_verified: false`
6. Identity spoofing: Create `/users/userA` with `uid: "userB"`
7. Privilege escalation: Create `/users/userA` with `role: "admin"`
8. Shadow field injection: Create `/users/userA` with extra key `isVerified: true`
9. Client timestamp forgery: Create `/users/userA` with forged `createdAt` not matching server timestamp
10. Post-create role escalation: Update `/users/userA` setting `role: "admin"`
11. Immutable field tampering: Update `/users/userA` modifying `uid` or `createdAt`
12. Value poisoning: Update `/users/userA` with `displayName` > 40 chars or non-boolean flag
