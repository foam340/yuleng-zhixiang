# Copy only this competition's proposal documents; never delete desktop originals.
param([string]$DesktopPath = (Join-Path $env:USERPROFILE 'Desktop'))
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $workspace '01-项目资料'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\artifacts\archive'))
New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$sources = @(Get-ChildItem -LiteralPath $DesktopPath -File | Where-Object {
  $_.Name -notlike '~$*' -and ($_.Name -match '^重庆国际生物城.*(冷链|池化).*\.(docx|doc|pdf|wps)$' -or $_.Name -match '^第三章.*(调度|小程序).*\.(docx|doc|pdf|wps)$')
})
$records = @()
foreach ($source in $sources) {
  $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
  $target = [IO.Path]::GetFullPath((Join-Path $archiveRoot $source.Name))
  if (-not $target.StartsWith($archiveRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive target escapes workspace' }
  if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $sourceHash) {
    $target = Join-Path $archiveRoot ($source.BaseName + '-归档-' + $sourceHash.Substring(0,12) + $source.Extension)
  }
  if (-not (Test-Path -LiteralPath $target)) {
    [IO.File]::Copy($source.FullName,$target,$false)
    $result = 'copied'
  } else { $result = 'existing-copy-verified' }
  $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  $latestSourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
  if ($targetHash -ne $sourceHash -or $latestSourceHash -ne $sourceHash) { throw ('Source changed or archive mismatch: ' + $source.Name) }
  $records += [ordered]@{source=$source.FullName;archive=$target;bytes=(Get-Item -LiteralPath $target).Length;sha256=$targetHash;result=$result;originalPreserved=$true}
}
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$report = Join-Path $outputRoot ('proposal-archive-' + $stamp + '.json')
$content = [ordered]@{verifiedAtUtc=[DateTime]::UtcNow.ToString('o');desktopScope='top-level matching project documents only';count=$records.Count;files=$records} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($report,$content,[Text.UTF8Encoding]::new($false))
Write-Output $content
Write-Output ('Archive manifest: ' + $report)
