param([string]$SourcePath = (Join-Path $PSScriptRoot '..\..\02-品牌素材\渝冷智享转发封面\approved-source-v2.png'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile([System.IO.Path]::GetFullPath($SourcePath))
$output = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\miniprogram\assets\brand\share-cover.jpg'))
$bitmap = [System.Drawing.Bitmap]::new(1000,800)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
try {
  # 仅规范尺寸和编码，不改变用户确认的文字、构图或颜色。
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::White)
  $cropWidth = [Math]::Min($source.Width,$source.Height*1.25)
  $cropHeight = $cropWidth/1.25
  $sourceRect = [System.Drawing.RectangleF]::new(($source.Width-$cropWidth)/2,($source.Height-$cropHeight)/2,$cropWidth,$cropHeight)
  $targetRect = [System.Drawing.RectangleF]::new(0,0,1000,800)
  $graphics.DrawImage($source,$targetRect,$sourceRect,[System.Drawing.GraphicsUnit]::Pixel)
  $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -EQ 'image/jpeg'
  $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]90)
  $bitmap.Save($output,$encoder,$parameters)
  Write-Output "$output (1000 x 800, JPEG quality 90)"
} finally {
  $parameters.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
  $source.Dispose()
}
