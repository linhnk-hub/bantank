/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ADMIN RELEASE CHANGELOG REGISTRY
 * Tracks every version/prompt update with sequential numbering, exact release date/time,
 * and structured change details for the Admin "Phiên bản" settings tab.
 */

export interface ReleaseChangeItem {
  headingVi: string;
  headingEn: string;
  descriptionVi?: string;
  descriptionEn?: string;
  subPointsVi?: string[];
  subPointsEn?: string[];
}

export interface ReleaseVersionEntry {
  id: string;
  version: string;
  releasedAt: string;
  titleVi: string;
  titleEn: string;
  changes: ReleaseChangeItem[];
}

/**
 * Ordered from newest to oldest so the latest release appears first (#1).
 * Append new entries at the top whenever a new prompt update is released.
 */
export const RELEASE_CHANGELOG: ReadonlyArray<ReleaseVersionEntry> = [
  {
    id: 'rel-1-8-9',
    version: 'v1.8.9',
    releasedAt: '25/11/2026 02:04',
    titleVi: 'Đưa mũi tên xổ xuống menu cạnh tiêu đề SOLO / CO-OP / VS & đồng bộ màu sắc hiệu ứng',
    titleEn: 'Position Dropdown Arrows Beside SOLO / CO-OP / VS Titles with Unified Colors & Effects',
    changes: [
      {
        headingVi: 'Đồng bộ vị trí, màu sắc và hiệu ứng mũi tên xổ xuống trên Trang chủ',
        headingEn: 'Unified Home Mode Card Dropdown Arrows',
        subPointsVi: [
          'Di chuyển mũi tên xổ xuống menu nằm trực tiếp kế bên tiêu đề các nút SOLO, CO-OP và VS.',
          'Thống nhất màu sắc và hiệu ứng sáng/xoay khi di chuột hoặc mở rộng: SOLO màu vàng (#FFB800), CO-OP màu xanh (#00F0FF), VS màu đỏ (#FF0055).',
        ],
        subPointsEn: [
          'Moved dropdown chevron indicators directly beside the SOLO, CO-OP, and VS button titles.',
          'Unified hover/expanded glow and rotation effects: SOLO yellow (#FFB800), CO-OP blue/cyan (#00F0FF), VS red (#FF0055).',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-8',
    version: 'v1.8.8',
    releasedAt: '25/11/2026 01:30',
    titleVi: 'Sửa lỗi tường thép căn cứ, quản trị Chat chung, chuẩn hóa mã phòng 4 số & nâng cấp trang chủ PC',
    titleEn: 'Fix Base Steel Wall Visual Bug, Admin Global Chat Moderation, 4-Digit Room Codes & Desktop Home Scale',
    changes: [
      {
        headingVi: 'Sửa lỗi hiển thị tường thép bảo vệ căn cứ khi hết thời gian',
        headingEn: 'Fixed Base Eagle Shield Wall Expiry Visual Sync',
        subPointsVi: [
          'Đồng bộ đầy đủ cả 5 ô tường quanh căn cứ (phía trên và 2 bên) về lại tường gạch khi vật phẩm bảo vệ căn cứ hết hiệu lực, khắc phục tình trạng 3 ô phía trên bị kẹt hình tường thép dù đạn vẫn bắn xuyên được.',
          'Bổ sung cơ chế tự dọn sprite gạch/thép cũ không còn tồn tại trong bản đồ địa hình.',
        ],
        subPointsEn: [
          'Synced all 5 base wall tiles (top and both sides) cleanly back to brick when Eagle Shield expires, eliminating stuck steel textures.',
          'Added automatic stale brick/steel sprite cleanup on terrain sync.',
        ],
      },
      {
        headingVi: 'Sửa nút Xóa tìm kiếm Cộng đồng & bổ sung quyền Admin xóa Chat chung',
        headingEn: 'Fixed Community Search Clear Button & Added Admin Global Chat Deletion',
        subPointsVi: [
          'Nút Xóa trong mục Tìm kiếm Cộng đồng nay xóa sạch từ khóa lẫn danh sách kết quả đang hiển thị ngay khi bấm.',
          'Tài khoản Admin có quyền xóa từng tin nhắn hoặc xóa toàn bộ tin nhắn (có bước xác nhận) trong kênh Chat chung Cộng đồng.',
        ],
        subPointsEn: [
          'Clear button in Community Search now clears both the query and displayed results immediately.',
          'Admin accounts can now delete individual messages or purge all Global Chat messages with confirmation.',
        ],
      },
      {
        headingVi: 'Chuẩn hóa mã phòng 4 chữ số (bỏ tiền tố BT) & tối ưu hiển thị Mobile',
        headingEn: 'Standardized 4-Digit Room Codes (Removed BT Prefix) & Compact Mobile Badge',
        subPointsVi: [
          'Loại bỏ hoàn toàn tiền tố "BT" khỏi chuỗi mã phòng (chỉ gồm 4 chữ số), quy tắc Firestore, ô nhập mã và toàn bộ hướng dẫn/nhãn hiển thị hệ thống.',
          'Trên điện thoại, khung mã phòng hiển thị gọn gàng cùng chiều cao và phong cách như nhãn "P1 VS P2" và "PHÒNG CÔNG KHAI".',
        ],
        subPointsEn: [
          'Removed the "BT" prefix from room codes (pure 4-digit numeric format), Firestore rules, join input, and all system labels/guides.',
          'On mobile, the room code box now matches the height and badge styling of "P1 VS P2" and "PUBLIC ROOM".',
        ],
      },
      {
        headingVi: 'Tinh gọn thẻ chế độ & tăng 30% kích thước trang chủ trên máy tính',
        headingEn: 'Cleaned Mode Card Badges & Scaled Desktop Home UI by +30%',
        subPointsVi: [
          'Gỡ bỏ nhãn phụ 1P CAMPAIGN, 2P CO-OP, PVP ONLINE trên các nút chế độ trang chủ.',
          'Tăng 30% kích thước hiển thị tổng thể, tiêu đề, thanh chỉ số và các nút bấm trang chủ trên giao diện máy tính mà vẫn giữ nguyên bố cục gọn gàng trên điện thoại.',
        ],
        subPointsEn: [
          'Removed 1P CAMPAIGN, 2P CO-OP, and PVP ONLINE caption badges from Home mode buttons.',
          'Increased overall Home screen display and button sizes by 30% on desktop while preserving mobile layout.',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-7',
    version: 'v1.8.7',
    releasedAt: '24/11/2026 19:02',
    titleVi: 'Khắc phục lỗi Deploy GitHub Pages trùng artifact & nâng cấp Node.js 24',
    titleEn: 'Fix GitHub Pages Duplicate Artifact Deploy Error & Upgrade to Node.js 24',
    changes: [
      {
        headingVi: 'Sửa lỗi Multiple artifacts named "github-pages" trên GitHub Actions',
        headingEn: 'Fixed Multiple "github-pages" Artifacts Error on GitHub Actions',
        subPointsVi: [
          'Tách quy trình CI/CD trong .github/workflows/main.yml thành 2 job độc lập: build và deploy (needs: build) để khi chạy lại job deploy không bị tải lên trùng lặp gói artifact.',
          'Gắn mã định danh duy nhất theo từng lượt chạy (github-pages-${{ github.run_id }}-${{ github.run_attempt }}) cho cả bước upload-pages-artifact và deploy-pages, loại bỏ triệt để lỗi xung đột 2 artifact cùng tên.',
        ],
        subPointsEn: [
          'Split the GitHub Pages workflow into separate build and deploy (needs: build) jobs so re-running a deployment never re-uploads a duplicate artifact.',
          'Scoped the Pages artifact name per run attempt (github-pages-${{ github.run_id }}-${{ github.run_attempt }}) across upload-pages-artifact and deploy-pages.',
        ],
      },
      {
        headingVi: 'Nâng cấp toàn bộ GitHub Actions lên chuẩn Node.js 24',
        headingEn: 'Upgraded GitHub Actions to Node.js 24 Runtime',
        descriptionVi:
          'Nâng cấp actions/checkout@v7, actions/setup-node@v7 (Node 24), actions/configure-pages@v6, actions/upload-pages-artifact@v5 và actions/deploy-pages@v5 để loại bỏ cảnh báo ngừng hỗ trợ Node.js 20.',
        descriptionEn:
          'Upgraded actions/checkout@v7, actions/setup-node@v7 (Node 24), actions/configure-pages@v6, actions/upload-pages-artifact@v5, and actions/deploy-pages@v5 to eliminate the Node.js 20 deprecation warning.',
      },
    ],
  },
  {
    id: 'rel-1-8-6',
    version: 'v1.8.6',
    releasedAt: '24/11/2026 16:45',
    titleVi: 'Hiển thị tab Phiên bản Admin, sửa Tìm kiếm Cộng đồng, ẩn ID & tên duy nhất',
    titleEn: 'Admin Versions Tab Fix, Chat-History Search, Hide Account IDs & Unique Display Names',
    changes: [
      {
        headingVi: 'Khắc phục không thấy mục Phiên bản khi đăng nhập tài khoản Admin',
        headingEn: 'Fixed Missing Versions Tab in Admin System Settings',
        descriptionVi:
          'Chuyển thanh tab Cài đặt hệ thống sang tự động xuống dòng (flex-wrap) và đồng bộ kiểm tra quyền Admin theo cả vai trò lẫn email quản trị để tab Phiên bản luôn hiển thị rõ ràng, không bị khuất mép phải.',
        descriptionEn:
          'Switched the System Settings tab bar to wrap cleanly across rows and aligned Admin verification checks so the Versions tab is always immediately visible without horizontal clipping.',
      },
      {
        headingVi: 'Sửa lỗi Tìm kiếm Cộng đồng liệt kê toàn bộ tài khoản',
        headingEn: 'Fixed Community Search Dumping All System Accounts',
        subPointsVi: [
          'Ghi nhận và khắc phục lỗi khi bấm tab/nút Tìm kiếm trong mục Cộng đồng trước đây tự liệt kê toàn bộ danh sách tài khoản hệ thống.',
          'Mục Tìm kiếm mặc định nay chỉ liệt kê các tài khoản mà người dùng hiện tại đã có lịch sử nhắn tin riêng (1-1), đồng thời lưu chỉ mục hội thoại trên Firestore (/private_chats/{chatId}) và bộ nhớ cục bộ.',
        ],
        subPointsEn: [
          'Fixed the bug where opening the Community Search tab or clicking Find with an empty query dumped all system accounts.',
          'Search now lists only accounts with whom the current user has private 1-on-1 messaging history by default, backed by a Firestore private chat index (/private_chats/{chatId}) and local history cache.',
        ],
      },
      {
        headingVi: 'Bỏ hiển thị ID tài khoản trong Tìm kiếm và Quản lý bạn bè',
        headingEn: 'Removed Account IDs in Community Search and Friends Management',
        descriptionVi:
          'Ẩn hoàn toàn mã định danh #BT-... khỏi kết quả Tìm kiếm, tiêu đề Chat riêng, popup Hồ sơ người chơi và mục Quản lý bạn bè toàn hệ thống.',
        descriptionEn:
          'Removed #BT-... handle tags from Community Search results, Private Chat headers, Public Profile popups, and the System Friends Management panel.',
      },
      {
        headingVi: 'Kiểm tra tên hiển thị duy nhất toàn hệ thống & ép đổi tên khi trùng',
        headingEn: 'System-Wide Unique Display Name Enforcement & Forced Rename Modal',
        subPointsVi: [
          'Thiết lập bảng khóa tên hiển thị duy nhất toàn hệ thống (/display_names/{nameHash}) kết hợp rà soát đối chiếu hồ sơ hiện có (không phân biệt hoa/thường và khoảng trắng thừa).',
          'Chặn đặt tên trùng ở mọi nơi đổi tên (Cài đặt Thông tin, Hồ sơ người chơi, đăng ký mới).',
          'Khi tài khoản đăng nhập có tên từ Google/email bị trùng với tên đã tồn tại trong hệ thống, lập tức hiển thị màn hình thông báo "Tên bị trùng trong hệ thống" kèm hộp thoại bắt buộc đổi tên duy nhất ngay trước khi vào ứng dụng.',
        ],
        subPointsEn: [
          'Added a global unique display name lock registry (/display_names/{nameHash}) cross-checked against existing public profiles (case-insensitive, collapsed whitespace).',
          'Blocked duplicate names across all rename entry points (Settings Profile, User Profile modal, and initial sign-in).',
          'When an account signs in with a Google/email-derived name that collides with an existing system name, a blocking "Name Already Exists in System" modal immediately requires choosing a unique display name before entering.',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-5',
    version: 'v1.8.5',
    releasedAt: '24/11/2026 03:25',
    titleVi: 'Bổ sung mục Phiên bản trong Cài đặt Admin',
    titleEn: 'Add Admin Release Version History Tab',
    changes: [
      {
        headingVi: 'Thêm mục Phiên bản dành riêng cho tài khoản Admin',
        headingEn: 'Added Admin-Only Version History Tab in System Settings',
        subPointsVi: [
          'Bổ sung tab Phiên bản trong menu Cài đặt hệ thống (chỉ hiển thị với tài khoản Admin, ẩn hoàn toàn với Mod và Người chơi).',
          'Liệt kê lịch sử cập nhật theo từng dòng có số thứ tự, mã phiên bản, tiêu đề tóm tắt và ngày giờ phát hành.',
          'Cho phép bấm vào từng dòng phiên bản để mở xem chi tiết đầy đủ nội dung các thay đổi theo từng hạng mục.',
        ],
        subPointsEn: [
          'Added a dedicated Versions tab in System Settings (visible exclusively to Admin accounts, hidden from Mod and Player roles).',
          'Lists every update row-by-row with sequence number, version tag, concise title, and exact release date/time.',
          'Clicking any version row opens the full structured breakdown of changes for that release.',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-4',
    version: 'v1.8.4',
    releasedAt: '24/11/2026 03:11',
    titleVi: 'Thu gọn nút Home, sửa Tạm dừng SOLO, Quân hàm EN & HUD CO-OP A.I',
    titleEn: 'Compact Home Cards, SOLO Pause Header, 17-Rank EN & CO-OP A.I HUD',
    changes: [
      {
        headingVi: 'Giảm 50% chiều cao nút SOLO, CO-OP, VS',
        headingEn: 'Reduced SOLO, CO-OP, and VS Card Heights by 50%',
        descriptionVi:
          'Thu gọn chiều cao tối thiểu từ 196px / 224px xuống 98px / 112px kèm tinh chỉnh khoảng đệm và cỡ chữ hài hòa trên màn hình chính.',
        descriptionEn:
          'Reduced minimum card heights from 196px / 224px to 98px / 112px with tighter padding and balanced typography on the Home screen.',
      },
      {
        headingVi: 'Giữ thanh top menu hiển thị khi đóng cửa sổ trên màn hình Tạm dừng (SOLO)',
        headingEn: 'Keep Top Menu Visible After Closing Modals While Paused (SOLO)',
        descriptionVi:
          'Giữ lớp phủ Tạm dừng luôn nằm dưới thanh header trên cùng (z-[35] so với header relative z-40), nên sau khi mở rồi đóng bất kỳ mục nào từ nút 3 gạch, thanh top menu và các chức năng trên đó vẫn luôn hiện và bấm được bình thường.',
        descriptionEn:
          'Kept the Pause overlay strictly below the top battle header (z-[35] vs header relative z-40) so closing any modal opened from the 3-line menu always keeps the top menu visible and interactive.',
      },
      {
        headingVi: 'Đồng bộ hiển thị tiếng Anh cho toàn bộ 17 cấp bậc quân hàm',
        headingEn: 'Synchronized English Localization Across All 17 Military Ranks',
        subPointsVi: [
          'Đã sửa tất cả vị trí trước đây chỉ hiển thị tên tiếng Việt (bao gồm mục Thông tin tài khoản trong Cài đặt, tiến độ quân hàm, hộp thoại Hồ sơ người chơi, thanh trên của màn chọn chế độ, popup xem thông tin bạn bè/người chơi trực tuyến và chi tiết tài khoản quản trị).',
          'Rà soát toàn bộ 17 cấp bậc từ Binh nhì (Private Second Class), Binh nhất (Private First Class) đến Đại tướng (General of the Army), đồng thời bỏ khoảng trắng thừa ở Colonel General (Thượng tướng).',
        ],
        subPointsEn: [
          'Fixed every screen that previously hardcoded Vietnamese rank names (Settings Profile stats & progress bar, User Profile modal, Mode Selection top bar, Online/Friends profile popup, and Admin account details).',
          'Audited all 17 ranks from Private Second Class (Binh nhì) and Private First Class (Binh nhất) through General of the Army (Đại tướng), and removed a stray leading space in Colonel General.',
        ],
      },
      {
        headingVi: 'Cập nhật giao diện CO-OP A.I',
        headingEn: 'Updated CO-OP A.I Battle HUD',
        subPointsVi: [
          'Gom số mạng P1 còn lại, số mạng AI còn lại và số địch còn lại vào chung 1 khung trên cả bảng thông số chiến đấu (di động/máy tính bảng) và HUD máy tính.',
          'Bổ sung dòng ghi chú Độ khó: Thử thách hoặc Độ khó: Giải trí (tự động đổi theo ngôn ngữ) ngay bên dưới tiêu đề màn chơi.',
        ],
        subPointsEn: [
          'Grouped P1 remaining lives, AI remaining lives, and remaining enemies into a single unified frame on both the mobile/tablet battle HUD and desktop HUD.',
          'Added a localized Difficulty note (Challenge / Casual) directly below the stage headline.',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-3',
    version: 'v1.8.3',
    releasedAt: '23/11/2026 16:28',
    titleVi: 'Sửa lỗi Tạm dừng SOLO, ảnh nền Home, số mạng VS & chống nháy Avatar',
    titleEn: 'SOLO Pause Resume Fix, Static Home Cards, Numeric VS Lives & Avatar Flicker Fix',
    changes: [
      {
        headingVi: 'Ẩn ID tài khoản trong Quản lý Bạn bè',
        headingEn: 'Hide Account IDs in Friends Management',
        descriptionVi:
          'Bỏ hiển thị mã định danh tài khoản ở cả 4 tab (Bạn bè, Lời mời nhận, Lời mời gửi, Đã xóa bạn).',
        descriptionEn:
          'Removed account handle tags across all 4 tabs (Friends, Received, Sent, Unfriended).',
      },
      {
        headingVi: 'Sửa lỗi bấm "TIẾP TỤC" bị chơi lại màn trong SOLO',
        headingEn: 'Fix SOLO "RESUME" Accidentally Restarting the Stage',
        descriptionVi:
          'Cố định vị trí hiển thị của hộp thoại Tạm dừng khi menu 3 gạch đóng lại lúc chạm/nhấn (pointerdown), loại bỏ tình trạng hộp thoại bị giật lên khiến thao tác nhấn vào nút TIẾP TỤC bị trượt sang nút CHƠI LẠI MÀN NÀY.',
        descriptionEn:
          'Kept Pause modal vertical padding invariant when the top 3-line drawer closed on pointerdown, preventing the modal from shifting upward into the Restart button before click fired.',
      },
      {
        headingVi: 'Ảnh nền mục SOLO, CO-OP, VS',
        headingEn: 'Static Full-Bleed Home Mode Card Backgrounds',
        descriptionVi:
          'Bỏ hiệu ứng cuộn ngang, đặt ảnh tĩnh phủ kín 100% diện tích từng khung (object-cover) và giảm 30% độ sáng hình nền.',
        descriptionEn:
          'Removed horizontal scrolling tracks, switched each mode card to a static 100% full-bleed cover image, and reduced image brightness by 30%.',
      },
      {
        headingVi: 'Hiển thị số mạng dạng số gọn trong khung',
        headingEn: 'Compact Numeric Lives Display in VS HUD',
        descriptionVi:
          'Thay dãy 3 biểu tượng trái tim bằng 1 biểu tượng trái tim kèm con số cho các vị trí P1, P2, AI 1, AI 2 để luôn vừa khít khung hiển thị.',
        descriptionEn:
          'Replaced 3-heart icon strips with a single heart icon plus numeric count for P1, P2, AI 1, and AI 2 so lives never overflow narrow HUD cells.',
      },
      {
        headingVi: 'Bỏ hiện tượng nháy danh sách avatar và nút LƯU',
        headingEn: 'Eliminated Avatar Grid and Save Button Flicker',
        descriptionVi:
          'Tách riêng trạng thái đang lưu tên hiển thị khỏi thao tác chọn ảnh đại diện, đồng thời cập nhật lựa chọn avatar tức thì để toàn bộ lưới ảnh và nút LƯU không còn bị mờ/nháy khi chọn lần lượt từng ảnh.',
        descriptionEn:
          'Decoupled display-name save state from avatar selection and added optimistic selection with sequence guards so avatar tiles and the Save button never blink.',
      },
    ],
  },
  {
    id: 'rel-1-8-2',
    version: 'v1.8.2',
    releasedAt: '23/11/2026 15:40',
    titleVi: 'Tổng nâng cấp 27 hạng mục UI/UX, chống kẹt xe tăng, Cộng đồng & VS Online',
    titleEn: '27-Item UI/UX, Tank Anti-Stuck, Social & VS Online Overhaul',
    changes: [
      {
        headingVi: 'Thông báo, Bạn bè & Cộng đồng trực tuyến',
        headingEn: 'Notifications, Friends & Online Community',
        subPointsVi: [
          'Thêm nút đóng cho mọi thông báo không tự ẩn; đưa hộp thoại xác nhận xóa bạn lên tầng trên cửa sổ Quản lý Bạn bè.',
          'Ẩn ID người chơi trong phần trực tuyến, hiển thị biểu tượng bạn bè bên cạnh nick đã kết bạn và không khôi phục danh sách cũ sau khi xóa sạch ô tìm kiếm.',
        ],
        subPointsEn: [
          'Added close buttons to persistent notices and elevated the unfriend confirmation dialog above the Friends modal.',
          'Hid player IDs in the online drawer, added a friend indicator next to confirmed friends, and kept search results cleared when returning after emptying the search box.',
        ],
      },
      {
        headingVi: 'Khung sân đấu, vùng bo đỏ & cơ chế chống kẹt xe tăng',
        headingEn: 'Arena Bounds, Red Shrink Zone & Tank Anti-Stuck',
        subPointsVi: [
          'Khắc phục viền khung che mép dưới và mép phải màn hình chơi; chặn di chuyển ra ngoài vùng bo đã thu hẹp.',
          'Cho phép 2 xe tăng đi qua nhau và tự reset về vị trí xuất phát nếu đứng chồng lên nhau quá 1 giây; bổ sung tự di chuyển né kẹt khi 2 AI đứng im đối đầu quá 3 giây.',
        ],
        subPointsEn: [
          'Fixed bottom and right arena border clipping and prevented tanks from moving outside the shrunk red danger boundary.',
          'Allowed tanks to pass through one another with a 1-second overlap auto-reset, and added a 3-second anti-stalemate maneuver for AI vs AI standoffs.',
        ],
      },
      {
        headingVi: 'Luồng phòng chờ VS Online & Trang chủ',
        headingEn: 'VS Online Room Flow & Home Menu',
        subPointsVi: [
          'Giữ P1 và P2 quay về chung phòng sau trận Solo P1 vs P2; rời phòng VS quay đúng sảnh VS thay vì Co-op Online.',
          'Tinh gọn giao diện VS (bỏ thời gian phía trên, bỏ x3 mạng, rút gọn tiêu đề phòng chờ & Luật chơi, bỏ ghi chú màu sắc và ghi chú XP/Sao/Xu).',
          'Chuyển nút SOLO sang dạng xổ danh sách Màn chơi (Màn 1–10) và lược bỏ các dòng mô tả thừa trên thẻ chế độ.',
        ],
        subPointsEn: [
          'Kept P1 and P2 in the same room when returning after Solo P1 vs P2, and ensured leaving a VS room returns to the VS lobby instead of Co-op Online.',
          'Streamlined VS HUD, lobby titles, rules copy, and result modal notices.',
          'Updated the Home SOLO button to expand the Stage 1–10 selector and removed redundant helper captions.',
        ],
      },
    ],
  },
  {
    id: 'rel-1-8-0',
    version: 'v1.8.0',
    releasedAt: '22/11/2026 18:00',
    titleVi: 'Phát hành nền tảng Quân hàm 17 cấp, Đấu VS Online & Hệ thống Xã hội',
    titleEn: '17 Military Ranks, VS Online PvP & Social Hub Foundation',
    changes: [
      {
        headingVi: 'Hệ thống 17 Cấp bậc Quân hàm & Kinh tế Sao (V1.4)',
        headingEn: '17-Rank Military Hierarchy & Star Economy (V1.4)',
        descriptionVi:
          'Xây dựng 17 cấp bậc từ Binh nhì đến Đại tướng theo tổng XP xác thực, tự động quy đổi 25 XP = 1 Sao ⭐ và bổ sung vật phẩm hỗ trợ chiến trường.',
        descriptionEn:
          'Launched the 17-rank progression table from Private Second Class to General of the Army, automatic 25 XP = 1 Star conversion, and tactical battlefield support items.',
      },
      {
        headingVi: 'Đấu trường Đối kháng VS Online (V1.2)',
        headingEn: 'VS Online PvP Arena (V1.2)',
        descriptionVi:
          'Ra mắt 2 thể thức đối kháng trực tuyến trên 2 thiết bị riêng biệt (P1 vs P2 và P1 + A.I vs P2 + A.I) với vòng bo hiệp phụ Sudden Death.',
        descriptionEn:
          'Launched real-time 2-device PvP modes (P1 vs P2 and P1 + A.I vs P2 + A.I) with shrinking Sudden Death hazard zones.',
      },
      {
        headingVi: 'Hệ thống Xã hội & Quản trị (M7.8)',
        headingEn: 'Social & Admin Management Hub (M7.8)',
        descriptionVi:
          'Tích hợp trạng thái Online/Offline, Chat chung, tìm kiếm người chơi, Bạn bè 4 tab, Chat riêng 1-1, Chặn người chơi và phân quyền Admin/Mod.',
        descriptionEn:
          'Integrated live Online presence, Global Chat, account search, 4-tab Friends management, 1-on-1 Private Chat, Block controls, and Admin/Mod RBAC.',
      },
    ],
  },
];

export const CURRENT_APP_VERSION = RELEASE_CHANGELOG[0]?.version ?? 'v1.8.5';
