param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$TextBase64
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
$rawLines = $text -split "`r?`n"

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName
if (-not $doc.PrinterSettings.IsValid) {
  throw "Printer not valid: $PrinterName"
}

$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5, 5, 5, 5)

$bodyFont = New-Object System.Drawing.Font('Courier New', 8.2, [System.Drawing.FontStyle]::Bold)
$boldFont = New-Object System.Drawing.Font('Courier New', 8.4, [System.Drawing.FontStyle]::Bold)
$shopFont = New-Object System.Drawing.Font('Arial', 16, [System.Drawing.FontStyle]::Bold)
$totalFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$lineIndex = 0

$lines = foreach ($rawLine in $rawLines) {
  if ($rawLine.StartsWith('[[SHOP]]')) {
    [PSCustomObject]@{ Text = $rawLine.Substring(8); Style = 'shop'; Align = 'center'; Spacing = 3 }
    continue
  }
  if ($rawLine.StartsWith('[[TOTAL]]')) {
    [PSCustomObject]@{ Text = $rawLine.Substring(9); Style = 'total'; Align = 'right'; Spacing = 3 }
    continue
  }
  if ($rawLine.StartsWith('[[CENTER]]')) {
    [PSCustomObject]@{ Text = $rawLine.Substring(10); Style = 'body'; Align = 'center'; Spacing = 0 }
    continue
  }
  if ($rawLine.StartsWith('[[BOLD]]')) {
    [PSCustomObject]@{ Text = $rawLine.Substring(8); Style = 'bold'; Align = 'left'; Spacing = 0 }
    continue
  }

  [PSCustomObject]@{ Text = $rawLine; Style = 'body'; Align = 'left'; Spacing = 0 }
}

$doc.add_PrintPage({
  param($sender, $e)

  $e.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  $y = $e.MarginBounds.Top

  while ($lineIndex -lt $lines.Length) {
    $line = $lines[$lineIndex]
    $font = $bodyFont
    if ($line.Style -eq 'shop') { $font = $shopFont }
    if ($line.Style -eq 'total') { $font = $totalFont }
    if ($line.Style -eq 'bold') { $font = $boldFont }

    $format = New-Object System.Drawing.StringFormat
    $format.LineAlignment = [System.Drawing.StringAlignment]::Near
    if ($line.Align -eq 'center') {
      $format.Alignment = [System.Drawing.StringAlignment]::Center
    } elseif ($line.Align -eq 'right') {
      $format.Alignment = [System.Drawing.StringAlignment]::Far
    } else {
      $format.Alignment = [System.Drawing.StringAlignment]::Near
    }

    $lineHeight = $font.GetHeight($e.Graphics)
    $rect = New-Object System.Drawing.RectangleF -ArgumentList $e.MarginBounds.Left, $y, $e.MarginBounds.Width, ($lineHeight + 2)
    $e.Graphics.DrawString($line.Text, $font, $brush, $rect, $format)
    $y += $lineHeight + $line.Spacing
    $lineIndex++

    if ($y + $lineHeight -gt $e.MarginBounds.Bottom) {
      $e.HasMorePages = $true
      return
    }
  }

  $e.HasMorePages = $false
})

$doc.Print()
Write-Output "ok"
