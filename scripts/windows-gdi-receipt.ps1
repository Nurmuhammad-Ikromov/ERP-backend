param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$ReceiptBase64
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$receiptJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ReceiptBase64))
$receipt = $receiptJson | ConvertFrom-Json

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName
if (-not $doc.PrinterSettings.IsValid) {
  throw "Printer not valid: $PrinterName"
}

$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8, 8, 8, 8)

$shopFont = New-Object System.Drawing.Font('Arial', 16, [System.Drawing.FontStyle]::Bold)
$metaFont = New-Object System.Drawing.Font('Consolas', 8.5, [System.Drawing.FontStyle]::Bold)
$headerFont = New-Object System.Drawing.Font('Consolas', 8.8, [System.Drawing.FontStyle]::Bold)
$tableFont = New-Object System.Drawing.Font('Consolas', 8.4, [System.Drawing.FontStyle]::Bold)
$totalFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
$footerFont = New-Object System.Drawing.Font('Arial', 10, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)

function New-DrawFormat {
  param([string]$Align)

  $format = New-Object System.Drawing.StringFormat
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near

  if ($Align -eq 'Center') {
    $format.Alignment = [System.Drawing.StringAlignment]::Center
  } elseif ($Align -eq 'Right') {
    $format.Alignment = [System.Drawing.StringAlignment]::Far
  } else {
    $format.Alignment = [System.Drawing.StringAlignment]::Near
  }

  return $format
}

$doc.add_PrintPage({
  param($sender, $e)

  $g = $e.Graphics
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  $left = [float]$e.MarginBounds.Left
  $top = [float]$e.MarginBounds.Top
  $width = [float]$e.MarginBounds.Width
  $right = $left + $width
  $contentLeft = $left + 2
  $contentRight = $right - 10
  $contentWidth = [float]($contentRight - $contentLeft)
  $y = $top

  $shopFormat = New-DrawFormat 'Center'
  $leftFormat = New-DrawFormat 'Left'
  $centerFormat = New-DrawFormat 'Center'
  $rightFormat = New-DrawFormat 'Right'

  $shopHeight = [Math]::Ceiling($shopFont.GetHeight($g)) + 2
  $metaHeight = [Math]::Ceiling($metaFont.GetHeight($g)) + 1
  $headerHeight = [Math]::Ceiling($headerFont.GetHeight($g)) + 2
  $tableHeight = [Math]::Ceiling($tableFont.GetHeight($g)) + 1
  $totalHeight = [Math]::Ceiling($totalFont.GetHeight($g)) + 2
  $footerHeight = [Math]::Ceiling($footerFont.GetHeight($g)) + 1

  $shopRect = New-Object System.Drawing.RectangleF -ArgumentList $contentLeft, $y, $contentWidth, $shopHeight
  $g.DrawString([string]$receipt.shopName, $shopFont, $brush, $shopRect, $shopFormat)
  $y += $shopHeight + 4

  $g.DrawLine($pen, $contentLeft, $y, $contentRight, $y)
  $y += 4

  foreach ($metaLine in @(
    "Chek   : $($receipt.receiptNumber)",
    "Sana   : $($receipt.date) $($receipt.time)",
    "Kassir : $($receipt.seller)"
  )) {
    $metaRect = New-Object System.Drawing.RectangleF -ArgumentList $contentLeft, $y, $contentWidth, $metaHeight
    $g.DrawString($metaLine, $metaFont, $brush, $metaRect, $leftFormat)
    $y += $metaHeight
  }

  $y += 2
  $g.DrawLine($pen, $contentLeft, $y, $contentRight, $y)
  $y += 4

  $columnGap = 4.0
  $nameWidth = [float][Math]::Floor($contentWidth * 0.54)
  $qtyWidth = [float][Math]::Floor($contentWidth * 0.14)
  $totalWidth = [float]($contentWidth - $nameWidth - $qtyWidth - ($columnGap * 2))
  $nameX = $contentLeft
  $qtyX = $nameX + $nameWidth + $columnGap
  $totalX = $qtyX + $qtyWidth + $columnGap

  $nameHeaderRect = New-Object System.Drawing.RectangleF -ArgumentList $nameX, $y, $nameWidth, $headerHeight
  $qtyHeaderRect = New-Object System.Drawing.RectangleF -ArgumentList $qtyX, $y, $qtyWidth, $headerHeight
  $totalHeaderRect = New-Object System.Drawing.RectangleF -ArgumentList $totalX, $y, $totalWidth, $headerHeight
  $g.DrawString('Mahsulot', $headerFont, $brush, $nameHeaderRect, $leftFormat)
  $g.DrawString('Miqdor', $headerFont, $brush, $qtyHeaderRect, $centerFormat)
  $g.DrawString('Jami', $headerFont, $brush, $totalHeaderRect, $rightFormat)
  $y += $headerHeight + 2

  $g.DrawLine($pen, $contentLeft, $y, $contentRight, $y)
  $y += 4

  foreach ($item in $receipt.items) {
    $nameLines = @($item.nameLines)
    if ($nameLines.Count -eq 0) {
      $nameLines = @('')
    }

    $blockHeight = [float]($nameLines.Count * $tableHeight)
    $middleY = $y + [float](($blockHeight - $tableHeight) / 2)

    for ($i = 0; $i -lt $nameLines.Count; $i += 1) {
      $lineY = $y + ($i * $tableHeight)
      $nameRect = New-Object System.Drawing.RectangleF -ArgumentList $nameX, $lineY, $nameWidth, $tableHeight
      $g.DrawString([string]$nameLines[$i], $tableFont, $brush, $nameRect, $leftFormat)
    }

    $qtyRect = New-Object System.Drawing.RectangleF -ArgumentList $qtyX, $middleY, $qtyWidth, $tableHeight
    $totalRect = New-Object System.Drawing.RectangleF -ArgumentList $totalX, $middleY, $totalWidth, $tableHeight
    $g.DrawString([string]$item.qty, $tableFont, $brush, $qtyRect, $centerFormat)
    $g.DrawString([string]$item.total, $tableFont, $brush, $totalRect, $rightFormat)
    $y += $blockHeight + 2
  }

  $g.DrawLine($pen, $contentLeft, $y, $contentRight, $y)
  $y += 6

  $totalRect = New-Object System.Drawing.RectangleF -ArgumentList $contentLeft, $y, $contentWidth, $totalHeight
  $g.DrawString("JAMI: $($receipt.totalText)", $totalFont, $brush, $totalRect, $rightFormat)
  $y += $totalHeight + 4

  $infoLines = @("To'lov: $($receipt.paymentLabel)")
  if ($receipt.paymentBreakdown) {
    foreach ($part in $receipt.paymentBreakdown) {
      if (-not [string]::IsNullOrWhiteSpace([string]$part)) {
        $infoLines += "  $part"
      }
    }
  }
  if ($receipt.paidText) { $infoLines += "To'landi: $($receipt.paidText)" }
  if ($receipt.debtText) { $infoLines += "Qarz: $($receipt.debtText)" }
  if ($receipt.customerName) { $infoLines += "Mijoz: $($receipt.customerName)" }
  if ($receipt.customerPhone) { $infoLines += "Tel  : $($receipt.customerPhone)" }
  if ($receipt.note) { $infoLines += "Izoh: $($receipt.note)" }

  foreach ($infoLine in $infoLines) {
    if ([string]::IsNullOrWhiteSpace($infoLine)) {
      continue
    }
    $infoRect = New-Object System.Drawing.RectangleF -ArgumentList $contentLeft, $y, $contentWidth, $metaHeight
    $g.DrawString($infoLine, $metaFont, $brush, $infoRect, $leftFormat)
    $y += $metaHeight
  }

  $y += 2
  $g.DrawLine($pen, $contentLeft, $y, $contentRight, $y)
  $y += 6

  foreach ($footerLine in @('Rahmat!', 'Yana keling :)')) {
    $footerRect = New-Object System.Drawing.RectangleF -ArgumentList $contentLeft, $y, $contentWidth, $footerHeight
    $g.DrawString($footerLine, $footerFont, $brush, $footerRect, $shopFormat)
    $y += $footerHeight
  }

  $e.HasMorePages = $false
})

$doc.Print()
Write-Output 'ok'
