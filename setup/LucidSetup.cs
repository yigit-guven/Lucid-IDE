using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.IO.Compression;
using System.Reflection;

namespace LucidInstaller
{
    // ─── Color & Font Palette ────────────────────────────────────────────────
    static class Theme
    {
        public static readonly Color Bg        = Color.FromArgb(10, 15, 40);
        public static readonly Color Card      = Color.FromArgb(18, 26, 60);
        public static readonly Color Border    = Color.FromArgb(30, 60, 100);
        public static readonly Color Text      = Color.FromArgb(241, 245, 249);
        public static readonly Color Muted     = Color.FromArgb(120, 150, 190);
        public static readonly Color Accent    = Color.FromArgb(56, 189, 248);    // sky-400
        public static readonly Color AccentDim = Color.FromArgb(14, 116, 163);
        public static readonly Color Success   = Color.FromArgb(52, 211, 153);
        public static readonly Color Danger    = Color.FromArgb(244, 63, 94);

        public static readonly Font H1    = new Font("Segoe UI", 22, FontStyle.Bold);
        public static readonly Font H2    = new Font("Segoe UI", 14, FontStyle.Bold);
        public static readonly Font Body  = new Font("Segoe UI", 10, FontStyle.Regular);
        public static readonly Font Small = new Font("Segoe UI", 9,  FontStyle.Regular);
        public static readonly Font Mono  = new Font("Consolas",  9,  FontStyle.Regular);
    }

    // ─── Main Form ────────────────────────────────────────────────────────────
    public class LucidSetupForm : Form
    {
        // Drag
        private bool  _dragging;
        private Point _dragStart;

        // State
        private int    _page = 0;       // 0=welcome 1=options 2=installing 3=done
        private bool   _installing;
        private string _targetDir;
        private bool   _createDesktopShortcut = true;
        private bool   _createStartMenuShortcut = true;
        private bool   _launchAfterInstall = true;
        private string _installedVersion = "";
        private HttpClient _http;

        // Header controls (persistent)
        private Label _btnClose, _btnMin;
        private PictureBox _iconBox;
        private Label _lblAppName;

        // Panel container
        private Panel _pagePanel;

        // Page 1
        private Label  _lblWelcomeTitle, _lblWelcomeDesc, _lblWelcomeVersion;
        private Button _btnNext1, _btnExit1;

        // Page 2
        private Label   _lblOptionsTitle;
        private TextBox _txtInstallPath;
        private Button  _btnBrowse;
        private CheckBox _chkDesktop, _chkStartMenu, _chkLaunch;
        private Button  _btnBack2, _btnInstall2;

        // Page 3
        private Label          _lblStep;
        private FlatProgressBar _progressBar;
        private Label          _lblPercent;
        private Label          _lblProgressDetail;
        private Label          _lblSpeed;
        private Label          _lblStepIndicator;
        private Button         _btnCancel3;
        private CancellationTokenSource _cts;

        // Page 4
        private Label  _lblDoneTitle, _lblDoneVersion, _lblDoneDesc;
        private Button _btnLaunch4, _btnClose4;

        public LucidSetupForm()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;
            _http = new HttpClient();
            _http.Timeout = TimeSpan.FromSeconds(90);
            _http.DefaultRequestHeaders.Add("User-Agent", "Lucid-IDE-Installer/1.0");
            _http.DefaultRequestHeaders.Add("Accept",     "application/vnd.github+json");

            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _targetDir = Path.Combine(local, "Programs", "Lucid IDE");

            Build();
            ShowPage(0);
        }

        // ── Window chrome ────────────────────────────────────────────────────
        private void Build()
        {
            this.Size            = new Size(560, 400);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition   = FormStartPosition.CenterScreen;
            this.BackColor       = Theme.Bg;
            this.DoubleBuffered  = true;
            this.Text            = "Lucid IDE Setup";

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            // Border
            this.Paint += (s, e) =>
            {
                using (var p = new Pen(Theme.Border, 1))
                    e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
                // Top accent line
                using (var br = new LinearGradientBrush(new Point(0, 0), new Point(Width, 0),
                    Theme.AccentDim, Theme.Accent))
                    e.Graphics.FillRectangle(br, 0, 0, Width, 2);
            };

            // ── Custom title bar (40px) ──────────────────────────────────────
            var titleBar = new Panel { Size = new Size(Width, 40), Location = new Point(0, 2), BackColor = Theme.Bg };
            titleBar.MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) { _dragging = true; _dragStart = e.Location; } };
            titleBar.MouseMove += (s, e) => { if (_dragging) Location = new Point(Location.X + e.X - _dragStart.X, Location.Y + e.Y - _dragStart.Y); };
            titleBar.MouseUp   += (s, e) => _dragging = false;
            Controls.Add(titleBar);

            // Logo icon in title bar
            _iconBox = new PictureBox { Size = new Size(20, 20), Location = new Point(12, 10), BackColor = Color.Transparent, SizeMode = PictureBoxSizeMode.Zoom };
            try
            {
                if (this.Icon != null)
                {
                    _iconBox.Image = this.Icon.ToBitmap();
                }
            }
            catch { }
            titleBar.Controls.Add(_iconBox);

            _lblAppName = new Label { Text = "Lucid IDE Setup", Font = Theme.Small, ForeColor = Theme.Muted, AutoSize = true, Location = new Point(36, 13), BackColor = Color.Transparent };
            titleBar.Controls.Add(_lblAppName);

            _btnMin = MakeIconBtn("—", new Point(Width - 65, 6));
            _btnMin.Click += (s, e) => WindowState = FormWindowState.Minimized;
            titleBar.Controls.Add(_btnMin);

            _btnClose = MakeIconBtn("✕", new Point(Width - 35, 6));
            _btnClose.MouseEnter += (s, e) => _btnClose.ForeColor = Theme.Danger;
            _btnClose.MouseLeave += (s, e) => _btnClose.ForeColor = Theme.Muted;
            _btnClose.Click += (s, e) =>
            {
                if (_installing)
                {
                    if (MessageBox.Show("Cancel installation?", "Lucid IDE Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                        Close();
                }
                else Close();
            };
            titleBar.Controls.Add(_btnClose);

            // ── Page panel (fills below title bar) ──────────────────────────
            _pagePanel = new Panel { Location = new Point(0, 42), Size = new Size(Width, Height - 42), BackColor = Color.Transparent };
            Controls.Add(_pagePanel);

            BuildPage1();
            BuildPage2();
            BuildPage3();
            BuildPage4();
        }

        private Label MakeIconBtn(string text, Point loc)
        {
            var lbl = new Label
            {
                Text = text, Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = Theme.Muted, Size = new Size(28, 28),
                Location = loc, TextAlign = ContentAlignment.MiddleCenter, Cursor = Cursors.Hand, BackColor = Color.Transparent
            };
            lbl.MouseEnter += (s, e) => ((Label)s).ForeColor = Theme.Text;
            lbl.MouseLeave += (s, e) => ((Label)s).ForeColor = Theme.Muted;
            return lbl;
        }

        // ── Page 1: Welcome ──────────────────────────────────────────────────
        private void BuildPage1()
        {
            _lblWelcomeTitle = MakeLabel("Welcome to Lucid IDE", Theme.H1, Theme.Accent, new Point(40, 25));
            _lblWelcomeDesc  = MakeLabel(
                "Local AI code intelligence — no subscriptions, no cloud,\nno telemetry. Everything runs on your machine.",
                Theme.Body, Theme.Muted, new Point(40, 90));
            _lblWelcomeVersion = MakeLabel("Version 1.0.0  ·  Windows x64", Theme.Small, Theme.Muted, new Point(40, 148));

            _btnNext1 = MakeButton("Install →", new Point(330, 295), new Size(130, 42), true);
            _btnNext1.Click += (s, e) => ShowPage(1);

            _btnExit1 = MakeButton("Cancel", new Point(210, 295), new Size(110, 42), false);
            _btnExit1.Click += (s, e) => Close();

            AddToPage(new Control[] { _lblWelcomeTitle, _lblWelcomeDesc, _lblWelcomeVersion, _btnNext1, _btnExit1 }, 1);
        }

        // ── Page 2: Options ──────────────────────────────────────────────────
        private void BuildPage2()
        {
            _lblOptionsTitle = MakeLabel("Installation Options", Theme.H2, Theme.Text, new Point(40, 20));

            var lblPath = MakeLabel("Install location", Theme.Small, Theme.Muted, new Point(40, 68));
            _txtInstallPath = new TextBox
            {
                Text = _targetDir, Font = Theme.Mono, BackColor = Theme.Card, ForeColor = Theme.Text,
                BorderStyle = BorderStyle.FixedSingle, Location = new Point(40, 86), Size = new Size(380, 24)
            };

            _btnBrowse = new Button
            {
                Text = "Browse…", Font = Theme.Small, BackColor = Theme.Card, ForeColor = Theme.Text,
                FlatStyle = FlatStyle.Flat, Location = new Point(428, 85), Size = new Size(90, 26), Cursor = Cursors.Hand
            };
            _btnBrowse.FlatAppearance.BorderColor = Theme.Border;
            _btnBrowse.Click += (s, e) =>
            {
                using (var dlg = new FolderBrowserDialog { Description = "Choose install folder", SelectedPath = _txtInstallPath.Text })
                    if (dlg.ShowDialog() == DialogResult.OK)
                        _txtInstallPath.Text = Path.Combine(dlg.SelectedPath, "Lucid IDE");
            };

            var lblShortcuts = MakeLabel("Shortcuts", Theme.Small, Theme.Muted, new Point(40, 130));

            _chkDesktop   = MakeCheckbox("Create Desktop shortcut",    new Point(40, 150), true);
            _chkStartMenu = MakeCheckbox("Create Start Menu shortcut", new Point(40, 176), true);
            _chkLaunch    = MakeCheckbox("Launch Lucid IDE after install", new Point(40, 202), true);

            var sep = new Panel { Location = new Point(40, 248), Size = new Size(480, 1), BackColor = Theme.Border };

            _btnInstall2 = MakeButton("Install", new Point(330, 270), new Size(130, 42), true);
            _btnInstall2.Click += BtnInstall_Click;

            _btnBack2 = MakeButton("← Back", new Point(210, 270), new Size(110, 42), false);
            _btnBack2.Click += (s, e) => ShowPage(0);

            AddToPage(new Control[] { _lblOptionsTitle, lblPath, _txtInstallPath, _btnBrowse, lblShortcuts, _chkDesktop, _chkStartMenu, _chkLaunch, sep, _btnInstall2, _btnBack2 }, 2);
        }

        // ── Page 3: Installing ───────────────────────────────────────────────
        private void BuildPage3()
        {
            var title = MakeLabel("Installing Lucid IDE", Theme.H2, Theme.Text, new Point(40, 20));
            title.Tag = "p3";

            _lblStep = MakeLabel("Preparing…", Theme.Body, Theme.Accent, new Point(40, 68));
            _lblStep.Tag = "p3";

            _progressBar = new FlatProgressBar { Location = new Point(40, 100), Size = new Size(410, 8) };
            _progressBar.Tag = "p3";

            _lblPercent = MakeLabel("0%", Theme.Body, Theme.Accent, new Point(460, 94));
            _lblPercent.Tag = "p3";

            _lblProgressDetail = MakeLabel("", Theme.Small, Theme.Muted, new Point(40, 118));
            _lblProgressDetail.Tag = "p3";
            _lblProgressDetail.AutoSize = false;
            _lblProgressDetail.Size = new Size(340, 16);

            _lblSpeed = MakeLabel("", Theme.Small, Theme.Muted, new Point(380, 118));
            _lblSpeed.Tag = "p3";
            _lblSpeed.AutoSize = false;
            _lblSpeed.Size = new Size(140, 16);
            _lblSpeed.TextAlign = ContentAlignment.TopRight;

            _lblStepIndicator = MakeLabel("", Theme.Small, Theme.Muted, new Point(40, 145));
            _lblStepIndicator.Tag = "p3";
            _lblStepIndicator.AutoSize = false;
            _lblStepIndicator.Size = new Size(480, 100);

            _btnCancel3 = MakeButton("Cancel", new Point(390, 270), new Size(130, 42), false);
            _btnCancel3.Tag = "p3";
            _btnCancel3.Click += (s, e) =>
            {
                if (MessageBox.Show("Are you sure you want to cancel the installation?", "Lucid IDE Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    _cts?.Cancel();
                }
            };

            AddToPage(new Control[] { title, _lblStep, _progressBar, _lblPercent, _lblProgressDetail, _lblSpeed, _lblStepIndicator, _btnCancel3 }, 3);
        }

        // ── Page 4: Done ─────────────────────────────────────────────────────
        private void BuildPage4()
        {
            // Big checkmark
            var lblCheck = new Label
            {
                Text = "✓", Font = new Font("Segoe UI", 42, FontStyle.Bold),
                ForeColor = Theme.Success, AutoSize = true, Location = new Point(40, 20), BackColor = Color.Transparent
            };
            lblCheck.Tag = "p4";

            _lblDoneTitle   = MakeLabel("Installation complete!", Theme.H2, Theme.Text,    new Point(110, 30));
            _lblDoneTitle.Tag = "p4";
            _lblDoneVersion = MakeLabel("",                        Theme.Body, Theme.Accent, new Point(110, 62));
            _lblDoneVersion.Tag = "p4";
            _lblDoneDesc    = MakeLabel("Shortcuts created on Desktop and Start Menu.\nLucid IDE is ready to use.", Theme.Small, Theme.Muted, new Point(110, 88));
            _lblDoneDesc.Tag = "p4";

            var sep = new Panel { Location = new Point(40, 248), Size = new Size(480, 1), BackColor = Theme.Border, Tag = "p4" };

            _btnLaunch4 = MakeButton("Launch Lucid IDE", new Point(290, 270), new Size(172, 42), true);
            _btnLaunch4.Tag = "p4";
            _btnLaunch4.Click += (s, e) => { LaunchIDE(); Close(); };

            _btnClose4 = MakeButton("Close", new Point(200, 270), new Size(80, 42), false);
            _btnClose4.Tag = "p4";
            _btnClose4.Click += (s, e) => Close();

            AddToPage(new Control[] { lblCheck, _lblDoneTitle, _lblDoneVersion, _lblDoneDesc, sep, _btnLaunch4, _btnClose4 }, 4);
        }

        // ── Page navigation ──────────────────────────────────────────────────
        private void ShowPage(int page)
        {
            _page = page;
            foreach (Control c in _pagePanel.Controls)
            {
                int pageTag = c.Tag is int t ? t : (c.Tag is string s && int.TryParse(s.Replace("p", ""), out int n) ? n : -1);
                c.Visible = (pageTag == page + 1);
            }
        }

        private void AddToPage(Control[] controls, int pageNumber)
        {
            foreach (var c in controls)
            {
                if (c.Tag == null) c.Tag = pageNumber;
                c.Visible = false;
                _pagePanel.Controls.Add(c);
            }
        }

        // ── Install logic ────────────────────────────────────────────────────
        private async void BtnInstall_Click(object sender, EventArgs e)
        {
            _targetDir = _txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(_targetDir)) { MessageBox.Show("Please choose an install location."); return; }

            // Check if already installed
            string exePath = Path.Combine(_targetDir, "Lucid IDE.exe");
            if (File.Exists(exePath))
            {
                var result = MessageBox.Show(
                    "Lucid IDE is already installed in this folder.\n\nDo you want to delete the installed version? Are you sure?",
                    "Lucid IDE Setup",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );
                if (result == DialogResult.Yes)
                {
                    try
                    {
                        // Try to close running instances first
                        foreach (var process in Process.GetProcessesByName("Lucid IDE"))
                        {
                            try { process.Kill(); process.WaitForExit(1000); } catch { }
                        }
                        if (Directory.Exists(_targetDir))
                        {
                            Directory.Delete(_targetDir, true);
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(
                            "Failed to delete the existing installation. Please make sure Lucid IDE is not running and try again.\n\nError: " + ex.Message,
                            "Lucid IDE Setup",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                        return;
                    }
                }
                else
                {
                    // User said No, abort installation and stay on options page
                    return;
                }
            }

            _createDesktopShortcut    = _chkDesktop.Checked;
            _createStartMenuShortcut  = _chkStartMenu.Checked;
            _launchAfterInstall       = _chkLaunch.Checked;

            _installing = true;
            _btnInstall2.Enabled = false;
            _btnBack2.Enabled = false;
            ShowPage(2);

            _cts = new CancellationTokenSource();
            string tempZip = Path.Combine(Path.GetTempPath(), "LucidIDE_setup.zip");

            try
            {
                // Step 1: Query GitHub
                SetStep("Checking latest version…", 2);
                string downloadUrl = await GetLatestDownloadUrl();
                if (string.IsNullOrEmpty(downloadUrl))
                    throw new Exception("No win32-x64 release found on GitHub. Make sure a release has been published.");

                _cts.Token.ThrowIfCancellationRequested();

                // Step 2: Download
                SetStep("Downloading Lucid IDE…", 5);
                await DownloadWithProgress(downloadUrl, tempZip, _cts.Token);

                _cts.Token.ThrowIfCancellationRequested();

                // Step 3: Extract
                SetStep("Extracting files…", 82);
                await ExtractWithProgress(tempZip, _targetDir, _cts.Token);

                _cts.Token.ThrowIfCancellationRequested();

                // Step 4: Shortcuts
                SetStep("Creating shortcuts…", 96);
                if (_createDesktopShortcut)   CreateShortcut(DesktopPath(), _targetDir);
                if (_createStartMenuShortcut) CreateShortcut(StartMenuPath(), _targetDir);

                // Cleanup
                try { File.Delete(tempZip); } catch { }

                // Step 5: Done
                SetStep("Done!", 100);

                // Get installed version
                try
                {
                    string pkgJson = Path.Combine(_targetDir, "resources", "app", "package.json");
                    if (File.Exists(pkgJson))
                    {
                        string content = File.ReadAllText(pkgJson);
                        var m = Regex.Match(content, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                        if (m.Success) _installedVersion = m.Groups[1].Value;
                    }
                }
                catch { }

                _installing = false;
                ShowDonePage();
            }
            catch (Exception ex)
            {
                _installing = false;
                
                // Clean up temp files if cancelled
                if (_cts != null && _cts.IsCancellationRequested)
                {
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }
                    try
                    {
                        if (Directory.Exists(_targetDir))
                        {
                            foreach (var process in Process.GetProcessesByName("Lucid IDE"))
                            {
                                try { process.Kill(); process.WaitForExit(1000); } catch { }
                            }
                            Directory.Delete(_targetDir, true);
                        }
                    }
                    catch { }

                    MessageBox.Show("Installation was cancelled.", "Lucid IDE Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("Installation failed:\n\n" + ex.Message, "Lucid IDE Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                ShowPage(1);
                _btnInstall2.Enabled = true;
                _btnBack2.Enabled = true;
            }
            finally
            {
                _cts?.Dispose();
                _cts = null;
            }
        }

        private void ShowDonePage()
        {
            string ver = string.IsNullOrEmpty(_installedVersion) ? "1.0.0" : _installedVersion;
            _lblDoneVersion.Text = "Lucid IDE v" + ver + " installed successfully";
            _btnLaunch4.Visible = _launchAfterInstall;

            string descLines = "";
            if (_createDesktopShortcut) descLines += "Desktop shortcut created.\n";
            if (_createStartMenuShortcut) descLines += "Start Menu shortcut created.\n";
            _lblDoneDesc.Text = descLines.TrimEnd('\n');

            ShowPage(3);
        }

        private void SetStep(string label, int progress)
        {
            this.BeginInvoke((Action)(() =>
            {
                _lblStep.Text = label;
                _progressBar.Value = progress;
                _lblPercent.Text = progress + "%";
            }));
        }

        private void SetDetail(string detail, string speed = "")
        {
            this.BeginInvoke((Action)(() =>
            {
                _lblProgressDetail.Text = detail;
                _lblSpeed.Text = speed;
            }));
        }

        private void AppendStepLog(string line)
        {
            this.BeginInvoke((Action)(() =>
            {
                _lblStepIndicator.Text += line + "\n";
            }));
        }

        // ── GitHub API ───────────────────────────────────────────────────────
        private async Task<string> GetLatestDownloadUrl()
        {
            string json = await _http.GetStringAsync("https://api.github.com/repos/yigit-guven/Lucid-IDE/releases/latest");
            var match = Regex.Match(json,
                "\"browser_download_url\"\\s*:\\s*\"(https://github\\.com/yigit-guven/Lucid-IDE/releases/download/[^\"]+?win32-x64[^\"]+?\\.zip)\"",
                RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : null;
        }

        // ── Download with speed + progress ───────────────────────────────────
        private async Task DownloadWithProgress(string url, string dest, CancellationToken token)
        {
            using (var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token))
            {
                response.EnsureSuccessStatusCode();
                long? total = response.Content.Headers.ContentLength;
                using (var src  = await response.Content.ReadAsStreamAsync())
                using (var file = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
                {
                    var buf = new byte[65536];
                    long read = 0;
                    int bytes;
                    var start = DateTime.Now;

                    while ((bytes = await src.ReadAsync(buf, 0, buf.Length, token)) > 0)
                    {
                        token.ThrowIfCancellationRequested();
                        await file.WriteAsync(buf, 0, bytes, token);
                        read += bytes;

                        if (total.HasValue)
                        {
                            double pct     = (double)read / total.Value;
                            int    bar     = (int)(pct * 72) + 5;  // 5–77
                            double dlMB    = read / (1024.0 * 1024.0);
                            double totMB   = total.Value / (1024.0 * 1024.0);
                            double elapsed = (DateTime.Now - start).TotalSeconds;
                            double speed   = elapsed > 0.5 ? (read / 1048576.0) / elapsed : 0;

                            this.BeginInvoke((Action)(() =>
                            {
                                _progressBar.Value = bar;
                                _lblPercent.Text = bar + "%";
                                _lblProgressDetail.Text = $"Downloading:  {dlMB:F1} MB  /  {totMB:F1} MB";
                                _lblSpeed.Text = speed > 0 ? $"{speed:F1} MB/s" : "";
                            }));
                        }
                        else
                        {
                            double dlMB    = read / (1024.0 * 1024.0);
                            double elapsed = (DateTime.Now - start).TotalSeconds;
                            double speed   = elapsed > 0.5 ? (read / 1048576.0) / elapsed : 0;

                            this.BeginInvoke((Action)(() =>
                            {
                                _lblProgressDetail.Text = $"Downloading:  {dlMB:F1} MB";
                                _lblSpeed.Text = speed > 0 ? $"{speed:F1} MB/s" : "";
                            }));
                        }
                    }
                }
            }
        }

        // ── Extraction with per-file progress ────────────────────────────────
        private Task ExtractWithProgress(string zipPath, string destDir, CancellationToken token)
        {
            return Task.Run(() =>
            {
                if (Directory.Exists(destDir))
                {
                    try { Directory.Delete(destDir, true); } catch { }
                }
                Directory.CreateDirectory(destDir);

                using (var archive = ZipFile.OpenRead(zipPath))
                {
                    int total = archive.Entries.Count;
                    int done  = 0;

                    foreach (var entry in archive.Entries)
                    {
                        token.ThrowIfCancellationRequested();
                        string destPath = Path.Combine(destDir, entry.FullName.Replace('/', Path.DirectorySeparatorChar));

                        if (entry.FullName.EndsWith("/"))
                        {
                            Directory.CreateDirectory(destPath);
                        }
                        else
                        {
                            string dir = Path.GetDirectoryName(destPath);
                            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                            entry.ExtractToFile(destPath, overwrite: true);
                        }

                        done++;
                        int bar = (int)((double)done / total * 13) + 82;  // 82–95

                        this.BeginInvoke((Action)(() =>
                        {
                            _progressBar.Value = bar;
                            _lblPercent.Text = bar + "%";
                            _lblProgressDetail.Text = $"Extracting file {done} of {total}";
                            _lblSpeed.Text = "";
                        }));
                    }
                }
            }, token);
        }

        // ── Shortcuts ────────────────────────────────────────────────────────
        private string FindExe() {
            string main = Path.Combine(_targetDir, "Lucid IDE.exe");
            if (File.Exists(main)) return main;
            foreach (var f in Directory.GetFiles(_targetDir, "*.exe", SearchOption.TopDirectoryOnly))
                return f;
            return null;
        }

        private void CreateShortcut(string lnkPath, string workDir)
        {
            string exePath = FindExe();
            if (exePath == null) return;

            string dir = Path.GetDirectoryName(lnkPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            try
            {
                Type t = Type.GetTypeFromCLSID(new Guid("72C24DD5-D70A-438B-8A42-98424B88AFB8")); // WScript.Shell
                dynamic shell    = Activator.CreateInstance(t);
                dynamic shortcut = shell.CreateShortcut(lnkPath);
                shortcut.TargetPath       = exePath;
                shortcut.WorkingDirectory = workDir;
                shortcut.Description      = "Lucid IDE — Local AI Code Editor";
                shortcut.IconLocation     = exePath + ",0";
                shortcut.Save();
            }
            catch { }
        }

        private string DesktopPath() =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "Lucid IDE.lnk");

        private string StartMenuPath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Lucid IDE");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "Lucid IDE.lnk");
        }

        // ── Launch ───────────────────────────────────────────────────────────
        private void LaunchIDE()
        {
            string exe = FindExe();
            if (exe != null)
                Process.Start(new ProcessStartInfo { FileName = exe, WorkingDirectory = _targetDir });
        }

        // ── Helpers ──────────────────────────────────────────────────────────
        private Label MakeLabel(string text, Font font, Color color, Point loc)
        {
            return new Label
            {
                Text = text, Font = font, ForeColor = color, AutoSize = true,
                Location = loc, BackColor = Color.Transparent
            };
        }

        private Button MakeButton(string text, Point loc, Size size, bool primary)
        {
            var btn = new Button
            {
                Text = text, Font = Theme.Body, Location = loc, Size = size,
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
                BackColor = primary ? Theme.Accent : Theme.Card,
                ForeColor = primary ? Theme.Bg      : Theme.Text
            };
            btn.FlatAppearance.BorderSize  = 0;
            btn.FlatAppearance.BorderColor = primary ? Theme.Accent : Theme.Border;

            if (primary)
            {
                btn.MouseEnter += (s, e) => btn.BackColor = Color.FromArgb(14, 165, 233);
                btn.MouseLeave += (s, e) => btn.BackColor = Theme.Accent;
            }
            else
            {
                btn.MouseEnter += (s, e) => btn.BackColor = Theme.Border;
                btn.MouseLeave += (s, e) => btn.BackColor = Theme.Card;
            }
            return btn;
        }

        private CheckBox MakeCheckbox(string text, Point loc, bool check)
        {
            return new CheckBox
            {
                Text = text, Font = Theme.Body, ForeColor = Theme.Text, BackColor = Color.Transparent,
                Checked = check, Location = loc, AutoSize = true, Cursor = Cursors.Hand
            };
        }
    }

    // ─── Flat Progress Bar ───────────────────────────────────────────────────
    public class FlatProgressBar : UserControl
    {
        private int _value = 0;

        public int Value
        {
            get => _value;
            set { _value = Math.Min(100, Math.Max(0, value)); Invalidate(); }
        }

        public FlatProgressBar()
        {
            DoubleBuffered = true;
            BackColor = Theme.Card;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // Track
            using (var b = new SolidBrush(Theme.Card))
                g.FillRectangle(b, 0, 0, Width, Height);

            // Fill
            if (_value > 0)
            {
                int fillW = (int)(Width * _value / 100.0);
                using (var br = new LinearGradientBrush(
                    new Point(0, 0), new Point(fillW, 0),
                    Theme.AccentDim, Theme.Accent))
                    g.FillRectangle(br, 0, 0, fillW, Height);
            }
        }
    }

    // ─── Entry Point ─────────────────────────────────────────────────────────
    public static class Program
    {
        [STAThread]
        public static void Main()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LucidSetupForm());
        }
    }
}
