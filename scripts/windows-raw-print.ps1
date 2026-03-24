param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$DataBase64
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  private static string LastError(string step) {
    return step + " failed. Win32Error=" + Marshal.GetLastWin32Error();
  }

  public static string SendBytesToPrinter(string printerName, byte[] bytes, string docName) {
    IntPtr hPrinter;
    var di = new DOCINFOA();
    di.pDocName = docName;
    di.pDataType = "RAW";

    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
      return LastError("OpenPrinter");
    }

    try {
      if (StartDocPrinter(hPrinter, 1, di) == 0) {
        return LastError("StartDocPrinter");
      }

      try {
        if (!StartPagePrinter(hPrinter)) {
          return LastError("StartPagePrinter");
        }

        try {
          int written;
          var ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
          if (!ok) {
            return LastError("WritePrinter");
          }
          if (written != bytes.Length) {
            return "WritePrinter partial write. Written=" + written + " Total=" + bytes.Length;
          }
          return null;
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

[byte[]]$bytes = [Convert]::FromBase64String($DataBase64)
$docName = "ADOKON Receipt " + (Get-Date -Format "yyyyMMdd-HHmmss")
$errorText = [RawPrinter]::SendBytesToPrinter($PrinterName, $bytes, $docName)
if ($null -ne $errorText -and $errorText -ne '') {
  throw "RAW print failed for printer: $PrinterName. $errorText"
}

Write-Output "ok"
