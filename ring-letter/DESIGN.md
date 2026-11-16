---
name: Ring letter
description: 夜裡的一封信：深色夜空上的一張信紙，安靜、可讀、不催促
colors:
  night-top: "#0c1a24"
  night: "#10232f"
  night-low: "#173140"
  ink: "#e8e5dc"
  muted: "#a8b5bc"
  gold: "#dcc99b"
  on-gold: "#1b2a33"
  paper: "#efe9db"
  paperink: "#2f3b41"
  paper-muted: "#4f5b5e"
  paper-control: "#737d7d"
  control-border: "#73848c"
  field: "#0b1820"
  placeholder: "#93a1a8"
  danger: "#f2b8a8"
  line: "#ffffff17"
  backdrop: "#06131be6"
  paper-line: "#2f3b4126"
typography:
  display:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.55
  headline:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.5
  letter:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 2.05
  body:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  body-small:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  tag: "4px"
  field: "6px"
  container: "8px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.on-gold}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    height: "44px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "48px"
  letter-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paperink}"
    typography: "{typography.letter}"
    padding: "40px 48px 32px"
  tag-not-open:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
---

# Design System: Ring letter

> 方向 D「夜空精修」（v3，#61）。D1（#71）已把 token、字體、共用元件（按鈕、chips、尚未開放標籤、勾選列）與外框（夜空、頁首、頁尾、焦點、選取色）換成這份規格；各頁的版面由 D2–D5 逐頁搬過來，舊的字級 token（`--text-*`、`--heading-*`）在 D6 移除。可操作的 prototype：https://claude.ai/artifact/CGEcTzN71uWR6Et4Czr2Un 。產品脈絡（誰在用、語氣、不做的事）在同目錄的 `PRODUCT.md`，這裡只談視覺。

## Overview

**Creative North Star: "夜裡的一封信"**

深夜，一個人，一張紙。夜空是安靜的底，不搶戲；信紙是畫面裡唯一明亮的東西，所以眼睛自然落在字上。金色只出現在少數幾個地方，像月光，告訴你「下一步在這裡」，從不催促。

版面寬鬆、一欄、靠左；閱讀頁只有一條 680px 的欄。介面退到信的後面：先讀完，才遇到下一步。整體只有深色一套，長文永遠放在淺色信紙上。

不做的視覺：行銷頁的大型動效、計數器、浮在畫面上的固定按鈕、標題上方的小標（eyebrow）、軌道線與星芒等裝飾、漸層文字、玻璃霧化。

**Key Characteristics:**
- 深色三段夜空＋一張淺色信紙，信紙是唯一的亮面。
- 金色用在五種地方，不多不少（見 The Moonlight Rule）。
- 明體寫信、黑體做介面；一欄 680px，文字靠左。
- 所有可點目標 ≥ 44px，焦點永遠看得見。
- 只有兩種動效，「減少動態」時全部關閉。

## Colors

一套深色：夜空三段漸層、米白的字、一張暖白信紙，加上一抹金色。

### Primary
- **月光金** (gold)：主按鈕底色、焦點框、導覽目前頁底線、首頁標題第二行、月亮。在三段夜空上 8.3–10.8:1。
- **金上墨** (on-gold)：金色按鈕上的字（9.0:1）。

### Neutral
- **夜空頂、夜空、夜空底** (night-top → night → night-low)：頁面背景由上到下的漸層；`night` 也是目前 `--bg` 的值。右上角疊一層很淡的金色月光暈，六顆 1–1.5px 的細星。
- **月下白** (ink)：主要文字，在夜空上 10.8–14.0:1。
- **霧灰** (muted)：次要文字、說明、未選的 chips 字，在夜空上 6.4–8.4:1。
- **信紙** (paper) 與 **信紙墨** (paperink)：信紙底與上面的字（9.5:1）。
- **信紙淡墨** (paper-muted)：信紙上的次要字，例如「作者當時的情境」、附記（5.8:1）。
- **信紙邊線** (paper-control)：信紙上的按鈕邊框，例如「有回應到我」（3.5:1）。
- **控制項邊線** (control-border)：夜空上的按鈕、chips、輸入欄邊框，在三段夜空上 3.5–4.6:1。
- **輸入欄底** (field) 與 **提示字** (placeholder)：輸入欄底色；提示字 6.8:1，文字 14.3:1。
- **細線** (line) 與 **信紙細線** (paper-line)：分隔線，只做裝飾，不用來標示可點的東西。
- **夜幕** (backdrop)：對話框（隱私說明、確認框）背後的遮罩，加 7px 模糊；對話框本身用夜空底 (night-low) 與控制項邊線。
- **警示** (danger)：只用在不可復原的動作，例如永久刪除（7.9–10.3:1）。

### Named Rules
**The Moonlight Rule.** 金色只用在五個地方：主按鈕、焦點框、導覽目前頁底線、首頁標題第二行、月亮。其他東西想變顯眼，用大小與位置，不用金色。

**The One Bright Surface Rule.** 畫面上只有信紙是亮的。卡片、輸入欄、對話框都是深色。

**The No Raw Hex Rule.** 元件 CSS 不寫色碼，一律用 token。新顏色先加進 `styles/tokens.css` 並在這裡寫明用途與對比值。

## Typography

**Display Font:** Noto Serif TC 400（自託管，fallback Songti TC、serif）
**Body Font:** Noto Sans TC 400／700（自託管，fallback PingFang TC、Microsoft JhengHei、sans-serif）

**Character:** 明體是信的聲音：標題、信文、品牌字。黑體是網站的聲音：導覽、說明、表單、按鈕。兩者不混用在同一個角色裡。

### Hierarchy
- **Display**（400，44px，手機 30px，行高 1.55）：只有首頁標題。
- **Headline**（400，32px，手機 26px，行高 1.5）：每頁的頁面標題。
- **Title**（400，24px，行高 1.5）：區段標題。
- **Letter**（400，18px，行高 2.05）：信文。一欄 680px，約每行 32 字；段距 1.15em。
- **Body**（400，16px，行高 1.85）：介面內文、按鈕、輸入欄。
- **Body small**（400，14px）：次要說明、求助專線、頁尾。
- **Label**（400，13px，行高 1.6）：標籤、信封一行、「尚未開放」、字數。12px 只用在必要的極小標示。

例外只有一個：**品牌字「Ring letter」**（明體 21px）。它是標誌，不是內文級數，不在 4＋3 級裡，也不給其他元素用。導覽連結桌機用 Body 16px，手機用 Body small 14px，以便四個連結在 320px 寬也排得下。

### Named Rules
**The Two Voices Rule.** 信的字用明體，網站的字用黑體。按鈕、表單、說明不用明體。

**The Balanced Heading Rule.** 標題用 `text-wrap: balance`，段落用 `text-wrap: pretty`，避免一行只剩一兩個字。

## Layout

兩種寬度，一條邊線。

- **閱讀欄**（680px，置中）：讀一封信、公開信箱、寫一封信、我的片段、隱私說明。
- **寬欄**（1120px）：首頁、管理頁、頁首、頁尾。
- **左右邊距**：手機 16px、桌機 24px。頁首、內容、頁尾共用同一條邊線，分隔線也只畫到邊線為止。
- **對齊**：文字一律靠左；置中的是欄，不是文字。
- **斷點**：`max-width: 640px`（手機）、`max-width: 1000px`（平板，也套用到手機）、`min-width: 1001px`（只有桌機）。CSS 變數不能用在 media query，每個模組直接寫數字，只用這三個。
- **間距**：沿用 `--space-1`…`--space-12`（4–48px）。同組元素靠近，不同組之間留大間距；標題上方的空間大於下方。
- **讀一封信的順序**：標題 → 說明 → 情境膠囊（標籤「想讀特定情境？（選填）」一直看得見，不再摺疊）→ 信封一行 → 信紙（當時情境、正文、附記、「有回應到我」）→「再讀一封」與「留下回音｜尚未開放」→ 求助專線。手機上正文要在第一屏下緣之前出現。

**The Read First Rule.** 下一步永遠在內容之後。不固定在畫面上，不在信讀完之前出現。

## Elevation & Depth

整體是平的，只有信紙浮起來。

### Shadow Vocabulary
- **信紙**（`box-shadow: 0 2px 6px #0003, 0 28px 64px #0007`）：信紙與首頁的信紙插圖。近的一層給邊緣，遠的一層給「放在夜裡」的距離。
- 其他元件沒有陰影。卡片與對話框用 `line` 細線和深色底區分。

**The Only Paper Floats Rule.** 陰影只給信紙。

## Shapes

- **膠囊**（999px）：按鈕、chips。
- **欄位**（6px）：輸入欄、下拉選單。
- **容器**（8px）：同意框、回饋框、管理頁卡片、摘要列。
- **標籤**（4px，虛線邊）：「尚未開放」。虛線只用來表示「還不能用」：未開放的入口、勾同意前的回饋 chips。
- **信紙**：直角，不加圓角，像真的紙。

## Components

### Buttons
- **Shape:** 膠囊（999px），高 48px；管理頁的列內按鈕高 44px。
- **Primary:** 月光金底、金上墨字，左右 24px；需要方向時加一個 16px 的繪製箭頭圖示（不用 →、↗ 字元）。一個畫面最多一個主按鈕。
- **箭頭圖示與按鈕名稱：** 圖示是 `aria-hidden` 的 SVG，所以按鈕的無障礙名稱不含箭頭。例如現在的「留下這封信 →」會變成「留下這封信」，「先讀一封 →」會變成「先讀一封」。哪個 PR 把字元換成圖示，就要在 PR 內文列出名稱變了的按鈕，並在同一個 PR 更新 e2e 的斷言（`getByRole("button", { name: … })` 等）。
- **Ghost:** 透明底、月下白字、控制項邊線。
- **Danger:** 透明底、警示色字與邊框，只給不可復原的動作，而且一定經過確認框。
- **Hover / Focus:** 背景或邊框顏色 0.2 秒過渡。焦點是 2px 月光金外框、間距 3px。

### Chips
- **Style:** 44px 膠囊，透明底、控制項邊線、霧灰字。
- **State:** 按下時月下白實心、夜空字，並帶 `aria-pressed="true"`。停用時邊線改虛線，旁邊一行文字說明怎麼啟用（例如「勾選上面的同意後，就可以選一個」），不只靠變淡。
- 手機上一排放不下時，整排橫向捲動，右緣淡出，提示還有更多。

### Cards / Containers
- **Corner Style:** 8px。
- **Background:** 夜空上用極淡的白（約 2%）或透明，以 `line` 細線圍起。
- **Shadow Strategy:** 沒有陰影（見 Elevation）。
- **Internal Padding:** 16–24px。

### Inputs / Fields
- **Style:** 輸入欄底、控制項邊線、6px 圓角、至少 48px 高；多行輸入至少 180px。
- **Focus:** 2px 月光金外框。
- **Error:** 錯誤訊息用 `role="alert"`，放在送出按鈕下方；欄位本身不變紅。
- **字數**：Label 字級、等寬數字，靠右。

### Checkbox rows
- 整列可點、至少 44px 高；20px 勾選框、`accent-color` 月光金。
- 同意文字逐字照 `components/write/ConsentFields.tsx`，不摺疊、不縮小。寫信頁三項同意放在一個標題為「分享與資料」的容器裡。

### Navigation
- 品牌字（明體 21px，唯一的字級例外，見 Typography）加一個月牙。主導覽四個連結，Body 16px（手機 Body small 14px）、霧灰，至少 44px 高。
- 目前頁：月下白字＋2px 月光金底線，並帶 `aria-current="page"`。膠囊形狀留給 chips，導覽不用。
- 頁首第一個 Tab 停點是「跳到主要內容」。

### Letter paper（signature）
- 信紙底、信紙墨字、Letter 字級；內距桌機 40/48px、手機 28/22px；手機上保留左右邊緣，不滿版。
- 上方是夜空上的「信封一行」：來源（範例信或真人投稿）、年份（範例信加「範例設定」）、情境，用 Label 字級。
- 信紙內依序：當時情境（Body small、信紙淡墨，下方細線）→ 正文 → 附記（虛線上緣）→「有回應到我」。按下後變成墨色實心並加 ✓，下方出現原有的說明「這個選擇只留在這次頁面中，尚未送出或儲存」（`role="status"`）；按下前不加新文案。
- 換信時信紙淡入並落下 6px：0.6 秒，`cubic-bezier(.16,1,.3,1)`。換信後焦點移到信紙。

### Not-open tag
- 13px、虛線 4px 框、跟著所在位置的文字色。緊跟在入口名稱後面，例如「留下回音｜尚未開放」。未開放的入口是文字，不是按鈕。

### Help lines
- 讀一封信、寫一封信、隱私說明的頁底：一行說明加三個專線連結（安心專線 1925、生命線 1995、張老師 1980），每個連結至少 44px 高。

## Do's and Don'ts

### Do:
- **Do** 讓所有可點目標至少 44px（`qa.spec` 不留例外）。
- **Do** 用 token 寫每一個顏色，並在本文件寫明新顏色的對比值。內文 ≥ 4.5:1，控制項邊框與焦點框 ≥ 3:1。
- **Do** 把下一步放在內容之後（The Read First Rule）。
- **Do** 在「減少動態」時關閉所有動效。
- **Do** 字體自託管，依 unicode-range 分片；除了 Turnstile，不連任何外部資源。

### Don't:
- **Don't** 新增第三種動效。只有換信與 0.2 秒的顏色過渡。
- **Don't** 在標題上方放小標（eyebrow）。
- **Don't** 用 `position: fixed` 或 `sticky` 把行動按鈕固定在畫面上。
- **Don't** 用 →、↗、✦ 等字元當圖示；需要圖示就畫 SVG，同一種線寬。
- **Don't** 只靠透明度表示停用；要有形狀變化（虛線）和一行說明。
- **Don't** 改同意勾選文字；要改就換新的 `CONSENT_VERSION`。
- **Don't** 加淺色主題、玻璃霧化、漸層文字、軌道線或星芒裝飾。
