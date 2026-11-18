$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconTarget = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\miniprogram\assets\icons'))
New-Item -ItemType Directory -Path $iconTarget -Force | Out-Null
function Stroke-Line([string]$points) {
  $vertices = foreach ($pair in $points.Split(' ')) { $xy = $pair.Split(','); [System.Drawing.PointF]::new([float]$xy[0],[float]$xy[1]) }
  $script:iconGraphics.DrawLines($script:iconPen,[System.Drawing.PointF[]]$vertices)
}
function Stroke-Rect([float]$x,[float]$y,[float]$w,[float]$h) { $script:iconGraphics.DrawRectangle($script:iconPen,$x,$y,$w,$h) }
function Stroke-Circle([float]$x,[float]$y,[float]$w,[float]$h) { $script:iconGraphics.DrawEllipse($script:iconPen,$x,$y,$w,$h) }
function Draw-Icon([string]$name,[string]$color,[string]$filename) {
  $bitmap = [System.Drawing.Bitmap]::new(72,72)
  $script:iconGraphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $script:iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $script:iconGraphics.ScaleTransform(3,3)
  $script:iconPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color),1.55)
  $script:iconPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $script:iconPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $script:iconPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  switch ($name) {
    'home' { Stroke-Line '3,10 12,3 21,10'; Stroke-Line '5,9 5,21 19,21 19,9'; Stroke-Line '9,21 9,14 15,14 15,21' }
    'warehouse' { Stroke-Line '3,9 12,4 21,9'; Stroke-Line '4,9 4,21 20,21 20,9'; Stroke-Rect 8 13 8 8; Stroke-Line '8,17 16,17'; Stroke-Line '10,9 14,9' }
    'resource' { Stroke-Rect 3 3 7 7; Stroke-Rect 14 3 7 7; Stroke-Rect 3 14 7 7; Stroke-Rect 14 14 7 7 }
    'calendar' { Stroke-Rect 4 5 16 16; Stroke-Line '8,3 8,7'; Stroke-Line '16,3 16,7'; Stroke-Line '4,10 20,10'; Stroke-Line '8,14 10,14'; Stroke-Line '14,14 16,14'; Stroke-Line '8,17 10,17' }
    'orders' { Stroke-Line '7,4 5,4 5,21 19,21 19,4 17,4'; Stroke-Rect 9 2.5 6 4; Stroke-Line '9,11 15,11'; Stroke-Line '9,15 15,15' }
    'user' { Stroke-Circle 8 3 8 8; $script:iconGraphics.DrawArc($script:iconPen,4,13,16,14,180,180); Stroke-Line '4,20 20,20' }
    'truck' { Stroke-Line '3,17 3,6 14,6 14,17'; Stroke-Line '14,10 18,10 21,14 21,17 20,17'; Stroke-Line '3,17 5,17'; Stroke-Line '9,17 15,17'; Stroke-Circle 5 15 4 4; Stroke-Circle 15 15 4 4 }
    'snow' { Stroke-Line '12,2 12,22'; Stroke-Line '3.5,7 20.5,17'; Stroke-Line '3.5,17 20.5,7'; Stroke-Line '9,4 12,7 15,4'; Stroke-Line '9,20 12,17 15,20'; Stroke-Line '4,10 7,10 7,6'; Stroke-Line '17,18 17,14 21,14'; Stroke-Line '4,14 7,14 7,18'; Stroke-Line '17,6 17,10 21,10' }
    'support' { Stroke-Line '3,8 17,8'; Stroke-Line '14,4 18,8 14,12'; Stroke-Line '21,16 7,16'; Stroke-Line '10,12 6,16 10,20' }
    'swap' { Stroke-Line '4,7 20,7 16,3'; Stroke-Line '20,17 4,17 8,21' }
    'arrow' { Stroke-Line '5,12 19,12'; Stroke-Line '13,6 19,12 13,18' }
    'plus' { Stroke-Line '12,5 12,19'; Stroke-Line '5,12 19,12' }
    'shield' { Stroke-Line '12,3 20,6 19,15 12,21 5,15 4,6 12,3'; Stroke-Line '8,12 11,15 16,9' }
    'check' { Stroke-Line '5,12 10,17 19,7' }
    'inbox' { Stroke-Line '4,11 7,4 17,4 20,11 20,20 4,20 4,11'; Stroke-Line '4,12 9,12 10,15 14,15 15,12 20,12' }
    'info' { Stroke-Circle 3 3 18 18; Stroke-Line '12,11 12,17'; Stroke-Line '12,7 12,7.2' }
  }
  $bitmap.Save((Join-Path $iconTarget $filename),[System.Drawing.Imaging.ImageFormat]::Png)
  $script:iconPen.Dispose(); $script:iconGraphics.Dispose(); $bitmap.Dispose()
}
foreach ($name in @('home','resource','calendar','orders','user')) {
  Draw-Icon $name '#7A8B99' ($name+'.png')
  Draw-Icon $name '#096C9C' ($name+'-active.png')
}
foreach ($name in @('warehouse','truck','snow','support','swap','arrow','plus','shield','check','inbox','info')) { Draw-Icon $name '#096C9C' ($name+'.png') }
foreach ($name in @('arrow','plus','warehouse')) { Draw-Icon $name '#FFFFFF' ($name+'-white.png') }
Write-Output '已生成24个本项目细线图标，尺寸72×72。'
