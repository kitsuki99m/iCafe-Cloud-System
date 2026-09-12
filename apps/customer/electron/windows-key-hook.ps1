$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class AezakmiWindowsKeyHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;
    private const int VK_TAB = 0x09;
    private const int VK_D = 0x44;
    private const int VK_LEFT = 0x25;
    private const int VK_RIGHT = 0x27;
    private const int VK_UP = 0x26;
    private const int VK_DOWN = 0x28;

    private static IntPtr hookId = IntPtr.Zero;
    private static LowLevelKeyboardProc proc = HookCallback;
    public static volatile bool Enabled = true;
    private static volatile bool WinDown = false;

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public System.Drawing.Point pt;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && Enabled) {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            bool keyDown = wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN;
            bool keyUp = wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP;
            if (k.vkCode == VK_LWIN || k.vkCode == VK_RWIN) {
                WinDown = keyDown || (WinDown && !keyUp);
                return (IntPtr)1;
            }
            // Explicitly consume the virtual-desktop and shell shortcuts even
            // if Windows reconstructs the chord after the Win key is swallowed.
            if (WinDown && (k.vkCode == VK_TAB || k.vkCode == VK_D ||
                k.vkCode == VK_LEFT || k.vkCode == VK_RIGHT ||
                k.vkCode == VK_UP || k.vkCode == VK_DOWN)) return (IntPtr)1;
        }
        return CallNextHookEx(hookId, nCode, wParam, lParam);
    }

    public static void Install() {
        using (var process = Process.GetCurrentProcess())
        using (var module = process.MainModule) {
            hookId = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(module.ModuleName), 0);
        }
        if (hookId == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }

    public static void Quit() { PostQuitMessage(0); }

    public static void Stop() {
        if (hookId != IntPtr.Zero) {
            UnhookWindowsHookEx(hookId);
            hookId = IntPtr.Zero;
        }
    }
}
'@ -ReferencedAssemblies 'System.Drawing'

$ready = $false
$stdinThread = [System.Threading.Thread]::new({
    while ($true) {
        $line = [Console]::ReadLine()
        if ($null -eq $line) { break }
        switch ($line.Trim().ToLowerInvariant()) {
            'lock'   { [AezakmiWindowsKeyHook]::Enabled = $true }
            'unlock' { [AezakmiWindowsKeyHook]::Enabled = $false }
            'stop'   { [AezakmiWindowsKeyHook]::Stop(); [AezakmiWindowsKeyHook]::Quit(); break }
        }
    }
})
$stdinThread.IsBackground = $true
$stdinThread.Start()

[AezakmiWindowsKeyHook]::Enabled = $true
[AezakmiWindowsKeyHook]::Install()
