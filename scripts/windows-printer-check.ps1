param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName
)

$ErrorActionPreference = 'Stop'

$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if ($null -ne $printer) {
  Write-Output 'true'
} else {
  Write-Output 'false'
}
