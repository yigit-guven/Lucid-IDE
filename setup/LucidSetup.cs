using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.IO.Compression;

namespace LucidInstaller
{
    public class LucidSetupForm : Form
    {
        // Styling Constants (Slate & Sky Blue Palette)
        private static readonly Color ColorBg = Color.FromArgb(15, 23, 42);           // slate-900
        private static readonly Color ColorCard = Color.FromArgb(30, 41, 59);         // slate-800
        private static readonly Color ColorText = Color.FromArgb(241, 245, 249);       // slate-100
        private static readonly Color ColorSecondary = Color.FromArgb(148, 163, 184);  // slate-400
        private static readonly Color ColorAccent = Color.FromArgb(56, 189, 248);      // sky-400 (Accent)
        private static readonly Color ColorAccentHover = Color.FromArgb(14, 165, 233);  // sky-500
        private static readonly Color ColorBorder = Color.FromArgb(51, 65, 85);        // slate-700
        private static readonly Font FontTitle = new Font("Segoe UI", 20, FontStyle.Bold);
        private static readonly Font FontHeading = new Font("Segoe UI", 12, FontStyle.Bold);
        private static readonly Font FontBody = new Font("Segoe UI", 10, FontStyle.Regular);
        private static readonly Font FontSmall = new Font("Segoe UI", 9, FontStyle.Regular);

        // Windows Dragging fields
        private bool _isDragging = false;
        private Point _dragStart;

        // UI Controls
        private Label _lblTitle;
        private Label _lblSubtitle;
        private Label _lblStatus;
        private Label _lblSpeedProgress;
        private CustomProgressBar _progressBar;
        private CustomButton _btnInstall;
        private CustomButton _btnCancel;
        private Label _btnClose;
        private Label _btnMinimize;

        // Installation State
        private bool _isInstalling = false;
        private string _targetDir;
        private HttpClient _httpClient;

        public LucidSetupForm()
        {
            InitializeComponent();
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Lucid-IDE-Web-Installer");
            
            // Default target directory: %LocalAppData%\Programs\Lucid IDE
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _targetDir = Path.Combine(localAppData, "Programs", "Lucid IDE");
        }

        private void InitializeComponent()
        {
            this.Size = new Size(550, 360);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = ColorBg;
            this.DoubleBuffered = true;

            // Form Border
            this.Paint += (s, e) =>
            {
                using (var pen = new Pen(ColorBorder, 1))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, this.Width - 1, this.Height - 1);
                }
            };

            // Custom Title Bar Area (Top 40px)
            var pnlHeader = new Panel
            {
                Size = new Size(this.Width, 40),
                Location = new Point(0, 0),
                BackColor = ColorBg
            };
            pnlHeader.MouseDown += Header_MouseDown;
            pnlHeader.MouseMove += Header_MouseMove;
            pnlHeader.MouseUp += Header_MouseUp;
            this.Controls.Add(pnlHeader);

            // Minimize Button
            _btnMinimize = new Label
            {
                Text = "—",
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = ColorSecondary,
                Size = new Size(30, 30),
                Location = new Point(this.Width - 65, 5),
                TextAlign = ContentAlignment.MiddleCenter,
                Cursor = Cursors.Hand
            };
            _btnMinimize.MouseEnter += (s, e) => _btnMinimize.ForeColor = ColorText;
            _btnMinimize.MouseLeave += (s, e) => _btnMinimize.ForeColor = ColorSecondary;
            _btnMinimize.Click += (s, e) => this.WindowState = FormWindowState.Minimized;
            pnlHeader.Controls.Add(_btnMinimize);

            // Close Button
            _btnClose = new Label
            {
                Text = "✕",
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = ColorSecondary,
                Size = new Size(30, 30),
                Location = new Point(this.Width - 35, 5),
                TextAlign = ContentAlignment.MiddleCenter,
                Cursor = Cursors.Hand
            };
            _btnClose.MouseEnter += (s, e) => _btnClose.ForeColor = Color.FromArgb(239, 68, 68); // Red
            _btnClose.MouseLeave += (s, e) => _btnClose.ForeColor = ColorSecondary;
            _btnClose.Click += (s, e) => { if (!_isInstalling || MessageBox.Show("Are you sure you want to cancel the installation?", "Cancel Installation", MessageBoxButtons.YesNo) == DialogResult.Yes) this.Close(); };
            pnlHeader.Controls.Add(_btnClose);

            // Logo & Title
            _lblTitle = new Label
            {
                Text = "Lucid IDE",
                Font = FontTitle,
                ForeColor = ColorAccent,
                AutoSize = true,
                Location = new Point(45, 60),
                BackColor = Color.Transparent
            };
            this.Controls.Add(_lblTitle);

            _lblSubtitle = new Label
            {
                Text = "Offline Code Intelligence & Local AI Client",
                Font = FontHeading,
                ForeColor = ColorText,
                AutoSize = true,
                Location = new Point(45, 105),
                BackColor = Color.Transparent
            };
            this.Controls.Add(_lblSubtitle);

            // Status Label
            _lblStatus = new Label
            {
                Text = "Ready to install Lucid IDE to your machine.",
                Font = FontBody,
                ForeColor = ColorSecondary,
                Size = new Size(460, 20),
                Location = new Point(45, 160),
                BackColor = Color.Transparent
            };
            this.Controls.Add(_lblStatus);

            // Speed/Progress Label (Right-aligned, small)
            _lblSpeedProgress = new Label
            {
                Text = "",
                Font = FontSmall,
                ForeColor = ColorSecondary,
                Size = new Size(200, 20),
                Location = new Point(305, 212),
                TextAlign = ContentAlignment.TopRight,
                BackColor = Color.Transparent
            };
            this.Controls.Add(_lblSpeedProgress);

            // Progress Bar
            _progressBar = new CustomProgressBar
            {
                Size = new Size(460, 8),
                Location = new Point(45, 200),
                Visible = false
            };
            this.Controls.Add(_progressBar);

            // Install Button
            _btnInstall = new CustomButton
            {
                Text = "Install Now",
                Size = new Size(130, 40),
                Location = new Point(245, 270),
                BackColor = ColorAccent,
                ForeColor = ColorBg,
                Font = FontHeading,
                Cursor = Cursors.Hand
            };
            _btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(_btnInstall);

            // Cancel Button
            _btnCancel = new CustomButton
            {
                Text = "Cancel",
                Size = new Size(110, 40),
                Location = new Point(395, 270),
                BackColor = ColorCard,
                ForeColor = ColorText,
                Font = FontHeading,
                Cursor = Cursors.Hand
            };
            _btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(_btnCancel);
        }

        #region Form Dragging
        private void Header_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                _isDragging = true;
                _dragStart = e.Location;
            }
        }

        private void Header_MouseMove(object sender, MouseEventArgs e)
        {
            if (_isDragging)
            {
                this.Location = new Point(
                    this.Location.X + (e.X - _dragStart.X),
                    this.Location.Y + (e.Y - _dragStart.Y)
                );
            }
        }

        private void Header_MouseUp(object sender, MouseEventArgs e)
        {
            _isDragging = false;
        }
        #endregion

        private async void BtnInstall_Click(object sender, EventArgs e)
        {
            if (_btnInstall.Text == "Launch Lucid IDE")
            {
                LaunchLucidIDE();
                this.Close();
                return;
            }

            if (_isInstalling) return;

            _isInstalling = true;
            _btnInstall.Enabled = false;
            _btnCancel.Enabled = false;
            _progressBar.Visible = true;
            _progressBar.Value = 0;

            try
            {
                // Step 1: Query GitHub releases for the latest x64 zip
                UpdateStatus("Checking latest version on GitHub...", 5);
                string downloadUrl = await GetLatestReleaseUrlAsync();
                if (string.IsNullOrEmpty(downloadUrl))
                {
                    throw new Exception("Could not find a valid win32-x64 zip release package on GitHub.");
                }

                // Step 2: Download the package
                string tempZip = Path.Combine(Path.GetTempPath(), "lucidide_setup.zip");
                UpdateStatus("Downloading package from GitHub...", 10);
                await DownloadFileWithProgressAsync(downloadUrl, tempZip);

                // Step 3: Extract the zip
                UpdateStatus("Extracting files to installation directory...", 85);
                await ExtractZipAsync(tempZip, _targetDir);

                // Step 4: Create shortcuts
                UpdateStatus("Creating desktop and start menu shortcuts...", 95);
                CreateShortcuts();

                // Clean up temp file
                if (File.Exists(tempZip))
                {
                    try { File.Delete(tempZip); } catch { }
                }

                UpdateStatus("Installation completed successfully!", 100);
                _progressBar.Visible = false;
                _lblSpeedProgress.Text = "";
                _btnInstall.Text = "Launch Lucid IDE";
                _btnInstall.Location = new Point(210, 270);
                _btnInstall.Size = new Size(180, 40);
                _btnInstall.Enabled = true;
                _btnCancel.Text = "Close";
                _btnCancel.Enabled = true;
                _isInstalling = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Installation failed:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                UpdateStatus("Installation failed.", 0);
                _progressBar.Visible = false;
                _lblSpeedProgress.Text = "";
                _btnInstall.Enabled = true;
                _btnCancel.Enabled = true;
                _isInstalling = false;
            }
        }

        private void UpdateStatus(string message, int progressPercent)
        {
            this.BeginInvoke((Action)(() =>
            {
                _lblStatus.Text = message;
                _progressBar.Value = progressPercent;
            }));
        }

        private async Task<string> GetLatestReleaseUrlAsync()
        {
            // Fetch release JSON from GitHub API
            var response = await _httpClient.GetAsync("https://api.github.com/repos/yigit-guven/Lucid-IDE/releases/latest");
            response.EnsureSuccessStatusCode();
            string json = await response.Content.ReadAsStringAsync();

            // Match browser_download_url that contains win32-x64 and ends with .zip
            var match = Regex.Match(json, "\"browser_download_url\":\\s*\"(https://github.com/yigit-guven/Lucid-IDE/releases/download/[^\"]+?win32-x64[^\"]+?\\.zip)\"", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Value;
            }
            return null;
        }

        private async Task DownloadFileWithProgressAsync(string url, string destinationPath)
        {
            using (var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                long? totalBytes = response.Content.Headers.ContentLength;

                using (var stream = await response.Content.ReadAsStreamAsync())
                using (var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true))
                {
                    var buffer = new byte[8192];
                    long totalRead = 0;
                    int bytesRead;
                    var startTime = DateTime.Now;

                    while ((bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    {
                        await fileStream.WriteAsync(buffer, 0, bytesRead);
                        totalRead += bytesRead;

                        if (totalBytes.HasValue)
                        {
                            double progress = (double)totalRead / totalBytes.Value;
                            int percentage = (int)(progress * 70) + 10; // Reserve 0-10 for version query, 80-100 for extraction

                            var elapsed = DateTime.Now - startTime;
                            double speedMbps = elapsed.TotalSeconds > 0 ? (totalRead / (1024.0 * 1024.0)) / elapsed.TotalSeconds : 0;
                            double downloadedMb = totalRead / (1024.0 * 1024.0);
                            double totalMb = totalBytes.Value / (1024.0 * 1024.0);

                            this.BeginInvoke((Action)(() =>
                            {
                                _progressBar.Value = percentage;
                                _lblStatus.Text = string.Format("Downloading Lucid IDE: {0:F1} MB / {1:F1} MB", downloadedMb, totalMb);
                                _lblSpeedProgress.Text = string.Format("{0:F1} MB/s ({1}%)", speedMbps, (int)(progress * 100));
                            }));
                        }
                    }
                }
            }
        }

        private Task ExtractZipAsync(string zipPath, string destDir)
        {
            return Task.Run(() =>
            {
                if (Directory.Exists(destDir))
                {
                    try { Directory.Delete(destDir, true); } catch { }
                }
                Directory.CreateDirectory(destDir);

                // Unpack the archive
                ZipFile.ExtractToDirectory(zipPath, destDir);
            });
        }

        private void CreateShortcuts()
        {
            try
            {
                string exePath = Path.Combine(_targetDir, "lucid.exe");
                if (!File.Exists(exePath))
                {
                    // Fall back check for lucid-insiders or other executable names
                    string[] exes = Directory.GetFiles(_targetDir, "*.exe", SearchOption.TopDirectoryOnly);
                    if (exes.Length > 0) exePath = exes[0];
                }

                // Desktop shortcut
                string desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Lucid IDE.lnk");
                CreateShortcutFile(desktopPath, exePath, _targetDir, "Lucid IDE editor");

                // Start Menu shortcut
                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Lucid IDE");
                Directory.CreateDirectory(startMenuDir);
                string startMenuPath = Path.Combine(startMenuDir, "Lucid IDE.lnk");
                CreateShortcutFile(startMenuPath, exePath, _targetDir, "Lucid IDE editor");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Shortcut creation error: " + ex.Message);
            }
        }

        private void CreateShortcutFile(string shortcutPath, string targetPath, string workingDir, string description)
        {
            // Create a shortcut using WshShell COM reflection to avoid compiling references
            Type t = Type.GetTypeFromCLSID(new Guid("72ADFD54-28D2-11D1-7E5C-00A0C91122D0")); // Windows Script Host WshShell CLSID
            if (t != null)
            {
                dynamic shell = Activator.CreateInstance(t);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.Description = description;
                shortcut.Save();
            }
        }

        private void LaunchLucidIDE()
        {
            try
            {
                string exePath = Path.Combine(_targetDir, "lucid.exe");
                if (!File.Exists(exePath))
                {
                    string[] exes = Directory.GetFiles(_targetDir, "*.exe");
                    if (exes.Length > 0) exePath = exes[0];
                }

                if (File.Exists(exePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        WorkingDirectory = _targetDir
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not start Lucid IDE:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    // Custom Button with Modern styling and Hover animations
    public class CustomButton : Button
    {
        private Color _normalColor;
        private Color _hoverColor = Color.FromArgb(14, 165, 233); // sky-500 default

        public CustomButton()
        {
            this.FlatStyle = FlatStyle.Flat;
            this.FlatAppearance.BorderSize = 0;
            this.TextAlign = ContentAlignment.MiddleCenter;
        }

        protected override void OnParentChanged(EventArgs e)
        {
            base.OnParentChanged(e);
            _normalColor = this.BackColor;
            if (_normalColor == Color.FromArgb(30, 41, 59)) // secondary
            {
                _hoverColor = Color.FromArgb(51, 65, 85);   // slate-700
            }
            else
            {
                _hoverColor = Color.FromArgb(14, 165, 233); // sky-500
            }
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            this.BackColor = _hoverColor;
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            this.BackColor = _normalColor;
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            base.OnPaint(pevent);
            // Optional: draw custom flat borders
        }
    }

    // Custom Progress Bar (Sleek Flat panel styling)
    public class CustomProgressBar : UserControl
    {
        private int _value = 0;
        private int _max = 100;

        public int Value
        {
            get => _value;
            set
            {
                _value = Math.Min(value, _max);
                this.Invalidate();
            }
        }

        public CustomProgressBar()
        {
            this.DoubleBuffered = true;
            this.BackColor = Color.FromArgb(30, 41, 59); // slate-800 background
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            
            // Draw background
            using (var brushBg = new SolidBrush(this.BackColor))
            {
                e.Graphics.FillRectangle(brushBg, 0, 0, this.Width, this.Height);
            }

            // Draw progress fill
            if (_value > 0)
            {
                float progressPercent = (float)_value / _max;
                int fillWidth = (int)(this.Width * progressPercent);

                using (var brushFill = new SolidBrush(Color.FromArgb(56, 189, 248))) // sky-400
                {
                    e.Graphics.FillRectangle(brushFill, 0, 0, fillWidth, this.Height);
                }
            }
        }
    }

    // Entry Point class
    public static class Program
    {
        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LucidSetupForm());
        }
    }
}
