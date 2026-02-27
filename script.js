document.addEventListener('DOMContentLoaded', () => {
    // === 設定値 ===
    const TARGET_DATE = new Date('2026-07-13T00:00:00+09:00'); // 個展搬入日
    const START_WORK_DATE = new Date('2026-03-09T00:00:00+09:00'); // 常駐案件開始日

    // Google Calendar API 設定
    const GOOGLE_CLIENT_ID = '36333170611-su8mje2hvgqbt7vdjieqn83rcoqcp05c.apps.googleusercontent.com';
    const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
    let accessToken = null;
    let calendarEventsHours = 0; // Googleカレンダーから取得した指定期間内の予定合計時間

    // 1日の計算定義 (時間)
    const HOURS_IN_DAY = 24;
    const SLEEP_HOURS = 7;
    const MEAL_HOURS = 2;
    const DAILY_SIDE_BUSINESS_HOURS = 1; // 副業時間（毎日固定1時間）
    const FIXED_UNAVAILABLE_HOURS_PER_DAY = SLEEP_HOURS + MEAL_HOURS + DAILY_SIDE_BUSINESS_HOURS; // 10時間
    const BASE_FREE_HOURS_PER_DAY = HOURS_IN_DAY - FIXED_UNAVAILABLE_HOURS_PER_DAY; // 休日の自由時間: 14時間
    const WORK_HOURS_PER_WEEKDAY = 8;
    const WEEKDAY_FREE_HOURS = BASE_FREE_HOURS_PER_DAY - WORK_HOURS_PER_WEEKDAY; // 3/9以降の平日の自由時間: 6時間

    // 月間固定案件
    const MONTHLY_SIDE_BUSINESS_HOURS = 35;

    // === 祝日判定用（簡易版: 2026年3月〜7月）===
    const HOLIDAYS_2026 = [
        '2026-03-20', // 春分の日
        '2026-04-29', // 昭和の日
        '2026-05-03', // 憲法記念日
        '2026-05-04', // みどりの日
        '2026-05-05', // こどもの日
        '2026-05-06', // 振替休日
        // 7/13までに祝日は無し
    ];

    function isHoliday(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateString = `${yyyy}-${mm}-${dd}`;
        return HOLIDAYS_2026.includes(dateString);
    }

    function isWeekendOrHoliday(date) {
        const dayOfWeek = date.getDay(); // 0(Sun) - 6(Sat)
        return dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(date);
    }

    // === 計算ロジック ===

    // 今日の残りの自由時間を計算（雑な概算ではなく本日の時間による）
    function getTodayRemainingFreeHours(now) {
        // ※ここでは簡易的に1日まるごとの時間を返すか、現在時刻をもとに引くかですが、
        // 全体の計算をシンプルにするため「今日はすでに経過した」もしくは「1日分フルである」として計算し、
        // 精密な時間単位の残りは割愛し「日単位」で集計します。
        // 以下は日単位での時間計算関数です。
    }

    function calculateFreeHoursForDate(date) {
        // 7/13以降は0
        if (date >= TARGET_DATE) return 0;

        const isWeekend = isWeekendOrHoliday(date);

        // 3/9より前なら全日ベース自由時間(15h)
        if (date < START_WORK_DATE) {
            return BASE_FREE_HOURS_PER_DAY;
        } else {
            // 3/9以降
            if (isWeekend) {
                return BASE_FREE_HOURS_PER_DAY; // 15h
            } else {
                return WEEKDAY_FREE_HOURS; // 7h
            }
        }
    }

    // === 時間集計 ===
    function calculateStats() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 残り日数の計算 (単純な日付の差分)
        const timeDiff = TARGET_DATE.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));

        let totalFreeHours = 0;
        let thisWeekFreeHours = 0;
        let thisMonthFreeHours = 0;

        const currentMonth = now.getMonth();

        // 現在所属している週の終わり(土曜日)を計算（カレンダーが日曜始まりのため）
        let dayOfWeek = now.getDay(); // 0:Sun, 1:Mon ... 6:Sat
        let daysToSaturday = 6 - dayOfWeek;

        // 日ごとにループして集計
        let iterDate = new Date(startOfToday);
        let iterDays = 0;

        while (iterDate < TARGET_DATE) {
            // ベースの自由時間
            const hours = calculateFreeHoursForDate(iterDate);

            // その月の日数を取得して、1日あたりの月間案件差し引き時間を算出
            // 例: 2月なら28日なので、35時間 ÷ 28日 = 1.25時間を1日あたり消費として計算
            const daysInMonth = new Date(iterDate.getFullYear(), iterDate.getMonth() + 1, 0).getDate();
            const dailySideBusinessDeduction = MONTHLY_SIDE_BUSINESS_HOURS / daysInMonth;

            // 自由時間から1日分の案件時間を差し引く（マイナスにならないよう制御）
            let netHours = Math.max(0, hours - dailySideBusinessDeduction);

            // 【リアルタイム計算】今日（初日）の場合は、現在時刻からの残り時間の割合を掛けて徐々に減らす
            if (iterDays === 0) {
                const nowMs = now.getTime();
                const startOfTodayMs = startOfToday.getTime();
                const endOfTodayMs = startOfTodayMs + 24 * 60 * 60 * 1000;

                // 既に経過した時間の割合 (0.0 〜 1.0)
                const elapsedFraction = (nowMs - startOfTodayMs) / (endOfTodayMs - startOfTodayMs);
                // 残り時間の割合
                const remainingFraction = Math.max(0, 1 - elapsedFraction);

                netHours = netHours * remainingFraction;
            }

            totalFreeHours += netHours;

            if (iterDays <= daysToSaturday) {
                thisWeekFreeHours += netHours;
            }

            if (iterDate.getMonth() === currentMonth) {
                thisMonthFreeHours += netHours;
            }

            // 日付を1日進める
            iterDate.setDate(iterDate.getDate() + 1);
            iterDays++;
        }

        return {
            daysRemaining,
            thisWeekFreeHours: Math.floor(thisWeekFreeHours),
            thisMonthFreeHours: Math.floor(thisMonthFreeHours),
            totalFreeHours: Math.max(0, Math.floor(totalFreeHours - calendarEventsHours)) // Googleカレンダーの予定時間を差し引く
        };
    }

    // === UI更新 ===
    function updateUI() {
        const stats = calculateStats();

        // カウントアップアニメーション関数
        function animateValue(obj, start, end, duration) {
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                // イージング easeOutQuart
                const easeOut = 1 - Math.pow(1 - progress, 4);
                obj.innerHTML = Math.floor(easeOut * (end - start) + start);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                } else {
                    obj.innerHTML = end; // 最後は正確な値に
                }
            };
            window.requestAnimationFrame(step);
        }

        animateValue(document.getElementById('days-val'), 0, stats.daysRemaining, 1500);
        animateValue(document.getElementById('week-time-val'), 0, stats.thisWeekFreeHours, 2000);
        animateValue(document.getElementById('month-time-val'), 0, stats.thisMonthFreeHours, 2000);
        animateValue(document.getElementById('total-time-val'), 0, stats.totalFreeHours, 2500);
    }

    // === グラフ描画 (Chart.js) ===
    function renderCharts() {
        Chart.defaults.color = '#d1bba4'; // 和風らしい暗い茗色をベースに
        Chart.defaults.font.family = "'Noto Serif JP', 'Inter', sans-serif";

        const commonOptions = {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        color: '#d1bba4', // 伝統色の伜做色
                        font: {
                            size: 16 // 1.5倍に拡大 (デフォルト12px)
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.raw}時間`;
                        }
                    }
                }
            },
            cutout: '60%'
        };

        // 和風配色パレット
        const COLOR_FREE = '#da8c4d';  // 萱草色系・少し黄色に寄せた明るい橙（自由時間）
        const COLOR_MEAL = '#e0b55c';  // 朽葉色・やや彩度を落とし明度を上げた黄（食事）
        const COLOR_WORK = '#489a95';  // 水浅葱系・明度を上げ彩度を落とした緑（仕事）
        const COLOR_SLEEP = '#9b5a8e';  // 梅紫・赤紫色寄り（睡眠）
        const COLOR_SIDEBUSINESS = '#2e5c8a'; // 瑠璃色・やや明るい藍色（副業）
        const BORDER_COLOR = '#1a1412'; // 背景色

        // 平日チャート（8h労働 + 1h副業 + 7h睡眠 + 2h食事（12-13時など）+ 6h自由）
        const ctxWeekday = document.getElementById('weekdayChart').getContext('2d');
        new Chart(ctxWeekday, {
            type: 'doughnut',
            data: {
                labels: ['仕事 8h', '副業 1h', '睡眠 7h', '食事 2h（12-13時など）', `自由時間 ${WEEKDAY_FREE_HOURS}h`],
                datasets: [{
                    data: [WORK_HOURS_PER_WEEKDAY, DAILY_SIDE_BUSINESS_HOURS, SLEEP_HOURS, MEAL_HOURS, WEEKDAY_FREE_HOURS],
                    backgroundColor: [COLOR_WORK, COLOR_SIDEBUSINESS, COLOR_SLEEP, COLOR_MEAL, COLOR_FREE],
                    borderColor: BORDER_COLOR,
                    borderWidth: 3,
                    hoverOffset: 6
                }]
            },
            options: commonOptions
        });

        // 休日チャート（1h副業 + 7h睡眠 + 2h食事 + 14h自由）
        const ctxHoliday = document.getElementById('holidayChart').getContext('2d');
        new Chart(ctxHoliday, {
            type: 'doughnut',
            data: {
                labels: ['副業 1h', '睡眠 7h', '食事 2h（12-13時など）', `自由時間 ${BASE_FREE_HOURS_PER_DAY}h`],
                datasets: [{
                    data: [DAILY_SIDE_BUSINESS_HOURS, SLEEP_HOURS, MEAL_HOURS, BASE_FREE_HOURS_PER_DAY],
                    backgroundColor: [COLOR_SIDEBUSINESS, COLOR_SLEEP, COLOR_MEAL, COLOR_FREE],
                    borderColor: BORDER_COLOR,
                    borderWidth: 3,
                    hoverOffset: 6
                }]
            },
            options: commonOptions
        });
    }

    // === 本日の日付表示とカレンダー描画 ===
    let currentCalMonth = new Date().getMonth();
    let currentCalYear = new Date().getFullYear();

    function renderDateAndCalendar() {
        const now = new Date();
        const todayElement = document.getElementById('today-date-display');

        // 本日の日付（初回のみ更新でOKですが、シンプルに毎回更新）
        const yyyyNow = now.getFullYear();
        const mmNow = String(now.getMonth() + 1).padStart(2, '0');
        const ddNow = String(now.getDate()).padStart(2, '0');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[now.getDay()];

        if (todayElement) {
            todayElement.textContent = `${yyyyNow} . ${mmNow} . ${ddNow}  (${dayName})`;
        }

        // カレンダー表示 (右上)
        const calHeader = document.getElementById('cal-month-year');
        const calGrid = document.getElementById('calendar-grid');
        const btnPrev = document.getElementById('cal-prev');
        const btnNext = document.getElementById('cal-next');
        if (!calHeader || !calGrid) return;

        // 月表示の更新
        const displayMm = String(currentCalMonth + 1).padStart(2, '0');
        calHeader.textContent = `${currentCalYear}年 ${displayMm}月`;

        // ボタン制御 (2026年2月〜7月までを対象とする)
        if (btnPrev) {
            btnPrev.disabled = (currentCalYear === 2026 && currentCalMonth <= 1); // 2月以前は戻れない
            btnPrev.onclick = () => {
                currentCalMonth--;
                if (currentCalMonth < 0) {
                    currentCalMonth = 11;
                    currentCalYear--;
                }
                renderDateAndCalendar();
            };
        }
        if (btnNext) {
            btnNext.disabled = (currentCalYear === 2026 && currentCalMonth >= 6); // 7月以降は進めない
            btnNext.onclick = () => {
                currentCalMonth++;
                if (currentCalMonth > 11) {
                    currentCalMonth = 0;
                    currentCalYear++;
                }
                renderDateAndCalendar();
            };
        }

        // 曜日ヘッダー
        calGrid.innerHTML = '';
        dayNames.forEach(d => {
            const div = document.createElement('div');
            div.className = 'cal-day-name';
            div.textContent = d;
            calGrid.appendChild(div);
        });

        // カレンダーの日付セル生成
        const firstDay = new Date(currentCalYear, currentCalMonth, 1);
        const lastDay = new Date(currentCalYear, currentCalMonth + 1, 0);

        // 前月の空白用
        for (let i = 0; i < firstDay.getDay(); i++) {
            const div = document.createElement('div');
            div.className = 'cal-day other-month';
            calGrid.appendChild(div);
        }

        // 当月の日付
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const div = document.createElement('div');
            div.className = 'cal-day';
            div.textContent = d;

            // 今日の判定
            if (currentCalYear === now.getFullYear() && currentCalMonth === now.getMonth() && d === now.getDate()) {
                div.classList.add('today');
            }
            // 休日の判定 (土日祝は文字色変更クラスを付与)
            const iterDate = new Date(currentCalYear, currentCalMonth, d);
            if (isWeekendOrHoliday(iterDate)) {
                div.classList.add('holiday');
            }
            calGrid.appendChild(div);
        }
    }

    // === Google Calendar API 連携 ===
    let tokenClient = null;

    // GISライブラリの読み込みを待ってtokenClientを初期化する
    function waitForGISAndInit() {
        const statusEl = document.getElementById('api-status-msg');
        let attempts = 0;
        const maxAttempts = 50; // 最大10秒間待機

        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                clearInterval(checkInterval);
                try {
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: CALENDAR_SCOPES,
                        callback: async (response) => {
                            if (response.error) {
                                if (statusEl) statusEl.textContent = '❌ 認証エラー: ' + response.error;
                                return;
                            }
                            accessToken = response.access_token;
                            if (statusEl) statusEl.textContent = '✔ 認証成功。カレンダーデータ取得中...';
                            await fetchCalendarEvents();
                        }
                    });
                    if (statusEl) statusEl.textContent = '🟢 Google Calendar連携準備完了';
                } catch (e) {
                    if (statusEl) statusEl.textContent = '❌ GIS初期化エラー: ' + e.message;
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                if (statusEl) statusEl.textContent = '❌ Googleライブラリの読み込みに失敗しました。ページを再読み込みしてください。';
            }
        }, 200);
    }

    function initGoogleAuth() {
        const signInBtn = document.getElementById('google-signin-btn');
        if (!signInBtn) return;

        // GISライブラリの読み込みを待機開始
        waitForGISAndInit();

        signInBtn.addEventListener('click', () => {
            const statusEl = document.getElementById('api-status-msg');
            if (!tokenClient) {
                if (statusEl) statusEl.textContent = '⏳ Googleライブラリ読み込み中…数秒後に再度お試しください。';
                return;
            }
            try {
                if (statusEl) statusEl.textContent = '🔄 Google認証画面を起動中...';
                tokenClient.requestAccessToken();
            } catch (e) {
                if (statusEl) statusEl.textContent = '❌ 認証起動エラー: ' + e.message;
            }
        });
    }

    async function fetchCalendarEvents() {
        if (!accessToken) return;
        const statusEl = document.getElementById('api-status-msg');

        const timeMin = encodeURIComponent('2026-03-09T00:00:00+09:00');
        const timeMax = encodeURIComponent('2026-07-13T00:00:00+09:00');
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=2500`;

        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) {
                if (statusEl) statusEl.textContent = `❌ 取得失敗 (HTTP ${res.status})。再ログインしてください。`;
                return;
            }
            const data = await res.json();
            const events = data.items || [];

            // 各イベントの所要時間を集計 (時間単位)
            let totalHours = 0;
            events.forEach(ev => {
                if (ev.start && ev.end) {
                    const start = new Date(ev.start.dateTime || ev.start.date);
                    const end = new Date(ev.end.dateTime || ev.end.date);
                    totalHours += Math.max(0, (end - start) / (1000 * 3600));
                }
            });
            calendarEventsHours = totalHours;

            // UIを再計算して反映
            updateUI();

            if (statusEl) {
                statusEl.textContent = `✔ Google Calendar連携済み (${events.length}件 / 約${Math.floor(calendarEventsHours)}h差し引き済み)`;
                statusEl.style.color = '#6fcf97';
                statusEl.style.borderColor = 'rgba(111, 207, 151, 0.5)';
            }
            // 接続ボタンをテキスト変更
            const btn = document.getElementById('google-signin-btn');
            if (btn) btn.textContent = '🔄 再同期する';

        } catch (err) {
            if (statusEl) statusEl.textContent = `❌ ネットワークエラー: ${err.message}`;
        }
    }

    // 初期化と実行
    updateUI();
    renderCharts();
    renderDateAndCalendar();
    initGoogleAuth();
});
