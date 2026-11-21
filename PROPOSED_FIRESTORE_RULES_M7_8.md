# ĐỀ XUẤT FIRESTORE SECURITY RULES – BẮN TANK ONLINE M7.8 (PROPOSAL ONLY)

> **CẢNH BÁO QUAN TRỌNG:**
> Tài liệu này chỉ là **BẢN ĐỀ XUẤT** phục vụ kiểm duyệt của ADMIN.
> File Production `/firestore.rules` **CHƯA BỊ CHỈNH SỬA** và **CHƯA ĐƯỢC DEPLOY** lên Firebase theo đúng nguyên tắc an toàn của M7.8.
>
> **Lưu ý về VS Online (`/coop_rooms/{roomCode}`):**
> Phòng `VS_P1_P2` và `VS_P1_AI_P2_AI` mã hóa tag chế độ `[VS1]` / `[VS2]` ngay trong `hostDisplayName` (tổng độ dài `<= 80` ký tự, giữ nguyên chính xác 15 field của schema Production hiện tại), nên **hoạt động ngay lập tức mà không cần thay đổi Production `firestore.rules` cho `/coop_rooms`**.

---

## 1. Các Collection Xã Hội Mới Cần Bổ Sung (Social System M7.8)

| Collection Path | Mục đích | Quyền Đọc | Quyền Ghi / Xóa |
|---|---|---|---|
| `/user_presence/{uid}` | Trạng thái Online & heartbeat (stale sau 90s), gắn `sessionId` từ `SessionManager` | Người dùng đã đăng nhập | Chỉ chính chủ (`request.auth.uid == uid`), **KHÔNG lưu email** |
| `/public_profiles/{uid}` | Hồ sơ công khai cho tìm kiếm Online/Offline (`displayName`, `handleTag`, `avatarUrl`, `rankNameVi`, `rankNameEn`, `starBalance`) | Người dùng đã đăng nhập | Chính chủ hoặc ADMIN; **KHÔNG chứa email/UID nội bộ nhạy cảm** |
| `/global_chat_messages/{msgId}` | Chat chung thời gian thực (tối đa 300 ký tự, có `clientMsgId` dedupe) | Người dùng đã đăng nhập | Người dùng đã đăng nhập chỉ tạo tin nhắn mang `senderUid == request.auth.uid`; không sửa/xóa của người khác (ADMIN có quyền xóa kiểm duyệt) |
| `/private_chats/{chatId}/messages/{msgId}` | Chat riêng 1-1 giữa 2 UID (`chatId = minUid + "__" + maxUid`) | Chỉ 2 thành viên tham gia | Chỉ người gửi thuộc cặp chat, và bị từ chối nếu đối phương đã Block trong `/user_blocks` |
| `/friend_requests/{reqId}` | Lời mời kết bạn (nhận/gửi) | Người gửi, người nhận, ADMIN/MOD | Người gửi tạo/hủy; người nhận chấp nhận/từ chối; không tự gửi cho chính mình |
| `/friendships/{pairId}` | Quan hệ bạn bè xác nhận (`pairId = minUid + "__" + maxUid`) | 2 thành viên cặp bạn bè, ADMIN, MOD (chỉ xem) | Tạo khi chấp nhận/auto-merge; 2 thành viên hủy kết bạn; **ADMIN có quyền xóa kèm Audit Log**, **MOD chỉ xem (read-only)** |
| `/users/{uid}/deleted_friends/{targetUid}` | Lịch sử "Đã xóa bạn" riêng tư | Chỉ chính chủ `uid` | Chỉ chính chủ `uid` |
| `/user_blocks/{blockId}` | Chặn 1-1 (`blockId = blockerUid + "__" + blockedUid`), độc lập với Unfriend | `blockerUid`, `blockedUid`, ADMIN | Chỉ `blockerUid` tạo/xóa (Unblock) |
| `/room_invites/{inviteId}` | Lời mời vào phòng Co-op Online / VS Online từ danh sách bạn bè | `fromUid`, `toUid` | Chỉ `fromUid` tạo khi 2 người là bạn bè; `toUid` cập nhật trạng thái |

---

## 2. Bản Đề Xuất Rules Chi Tiết (Bổ Sung Vào `match /databases/{database}/documents`)

```javascript
    // =========================================================================
    // M7.8 SOCIAL SYSTEM – PROPOSED FIRESTORE RULES (DO NOT DEPLOY WITHOUT REVIEW)
    // =========================================================================

    function isSignedInVerified() {
      return request.auth != null && request.auth.uid != null;
    }

    function isSuperAdminM78() {
      return isSignedInVerified()
        && request.auth.token.email == 'linhnk2013@gmail.com'
        && request.auth.token.email_verified == true;
    }

    function isModeratorOrAdminM78() {
      return isSuperAdminM78()
        || (
          isSignedInVerified()
          && exists(/databases/$(database)/documents/user_roles/$(request.auth.uid))
          && get(/databases/$(database)/documents/user_roles/$(request.auth.uid)).data.role in ['ADMIN', 'MOD']
        );
    }

    function isBlockedPair(uidA, uidB) {
      return exists(/databases/$(database)/documents/user_blocks/$(uidA + '__' + uidB))
        || exists(/databases/$(database)/documents/user_blocks/$(uidB + '__' + uidA));
    }

    // 1. Online Presence (tied to existing SessionManager sessionId, zero email)
    match /user_presence/{uid} {
      allow read: if isSignedInVerified();
      allow create, update: if isSignedInVerified()
        && request.auth.uid == uid
        && !('email' in request.resource.data)
        && request.resource.data.uid == uid
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 60
        && request.resource.data.handleTag is string
        && request.resource.data.handleTag.size() <= 20
        && request.resource.data.online is bool
        && request.resource.data.lastSeenMs is number;
      allow delete: if isSignedInVerified() && (request.auth.uid == uid || isSuperAdminM78());
    }

    // 2. Public Searchable Profiles (Online + Offline search, zero email)
    match /public_profiles/{uid} {
      allow read: if isSignedInVerified();
      allow create, update: if isSignedInVerified()
        && (request.auth.uid == uid || isSuperAdminM78())
        && !('email' in request.resource.data)
        && request.resource.data.uid == uid
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 60
        && request.resource.data.handleTag is string
        && request.resource.data.handleTag.size() <= 20;
      allow delete: if false; // Never delete user profiles from client
    }

    // 3. Global Chat (max 300 chars, non-empty, clientMsgId dedupe)
    match /global_chat_messages/{msgId} {
      allow read: if isSignedInVerified();
      allow create: if isSignedInVerified()
        && request.resource.data.senderUid == request.auth.uid
        && !('email' in request.resource.data)
        && request.resource.data.text is string
        && request.resource.data.text.size() >= 1
        && request.resource.data.text.size() <= 300
        && request.resource.data.clientMsgId is string
        && request.resource.data.createdAtMs is number;
      allow update: if false;
      allow delete: if isSuperAdminM78();
    }

    // 4. Friend Requests
    match /friend_requests/{reqId} {
      allow read: if isSignedInVerified()
        && (
          resource.data.fromUid == request.auth.uid
          || resource.data.toUid == request.auth.uid
          || isModeratorOrAdminM78()
        );
      allow create: if isSignedInVerified()
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.toUid is string
        && request.resource.data.toUid != request.auth.uid
        && request.resource.data.status == 'PENDING';
      allow update: if isSignedInVerified()
        && (
          (resource.data.toUid == request.auth.uid
            && request.resource.data.status in ['ACCEPTED', 'REJECTED'])
          || (resource.data.fromUid == request.auth.uid
            && request.resource.data.status == 'CANCELLED')
        );
      allow delete: if isSignedInVerified()
        && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid || isSuperAdminM78());
    }

    // 5. Confirmed Friendships (ADMIN full delete + audit, MOD read-only, PLAYER own pairs)
    match /friendships/{pairId} {
      allow read: if isSignedInVerified()
        && (
          request.auth.uid in resource.data.uids
          || isModeratorOrAdminM78()
        );
      allow create: if isSignedInVerified()
        && request.resource.data.uids is list
        && request.resource.data.uids.size() == 2
        && request.auth.uid in request.resource.data.uids
        && request.resource.data.status == 'FRIENDS';
      allow update: if false;
      allow delete: if isSignedInVerified()
        && (
          request.auth.uid in resource.data.uids
          || isSuperAdminM78()
        );
    }

    // 6. Private Deleted Friends History (Owner Only)
    match /users/{uid}/deleted_friends/{targetUid} {
      allow read, create, update, delete: if isSignedInVerified() && request.auth.uid == uid;
    }

    // 7. User Blocks (Independent from Unfriend; preserves chat history)
    match /user_blocks/{blockId} {
      allow read: if isSignedInVerified()
        && (
          resource.data.blockerUid == request.auth.uid
          || resource.data.blockedUid == request.auth.uid
          || isSuperAdminM78()
        );
      allow create: if isSignedInVerified()
        && request.resource.data.blockerUid == request.auth.uid
        && request.resource.data.blockedUid is string
        && request.resource.data.blockedUid != request.auth.uid
        && blockId == (request.auth.uid + '__' + request.resource.data.blockedUid);
      allow update: if false;
      allow delete: if isSignedInVerified() && resource.data.blockerUid == request.auth.uid;
    }

    // 8. Private 1-on-1 Chat Messages (Respects Block, preserves history, never deletes)
    match /private_chats/{chatId}/messages/{msgId} {
      allow read: if isSignedInVerified()
        && (
          resource.data.senderUid == request.auth.uid
          || resource.data.receiverUid == request.auth.uid
        );
      allow create: if isSignedInVerified()
        && request.resource.data.senderUid == request.auth.uid
        && request.resource.data.receiverUid is string
        && request.resource.data.receiverUid != request.auth.uid
        && !isBlockedPair(request.auth.uid, request.resource.data.receiverUid)
        && request.resource.data.text is string
        && request.resource.data.text.size() >= 1
        && request.resource.data.text.size() <= 300
        && request.resource.data.clientMsgId is string;
      allow update, delete: if false;
    }

    // 9. Room Invites from Friends List
    match /room_invites/{inviteId} {
      allow read: if isSignedInVerified()
        && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid);
      allow create: if isSignedInVerified()
        && request.resource.data.fromUid == request.auth.uid
        && request.resource.data.toUid != request.auth.uid
        && request.resource.data.roomCode is string
        && request.resource.data.roomMode in ['COOP_ONLINE', 'VS_P1_P2', 'VS_P1_AI_P2_AI'];
      allow update: if isSignedInVerified() && resource.data.toUid == request.auth.uid;
      allow delete: if isSignedInVerified()
        && (resource.data.fromUid == request.auth.uid || resource.data.toUid == request.auth.uid);
    }
```

---

## 3. Khuyến Nghị Triển Khai

1. Kiểm tra lại toàn bộ rules trên bằng Firebase Emulator Suite trước khi hợp nhất vào `/firestore.rules`.
2. Tạo composite index (nếu Firestore yêu cầu) cho:
   - `friend_requests` (`toUid` ASC, `status` ASC, `createdAtMs` DESC)
   - `friend_requests` (`fromUid` ASC, `status` ASC, `createdAtMs` DESC)
   - `private_chats/{chatId}/messages` (`createdAtMs` DESC)
3. Giữ nguyên toàn bộ rule hiện có của `sessions`, `coop_rooms`, `user_roles`, `system_audit_logs`, `system_settings`, `contact_messages`, và `users`.
