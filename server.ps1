$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Ghost Writer Server running at http://localhost:8080/"

$baseDir = "c:\Users\bakavro\Desktop\ghost writing"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        
        $path = $req.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($path)) {
            $path = "index.html"
        }
        
        $filePath = Join-Path $baseDir $path
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($path.EndsWith(".html")) {
                $res.ContentType = "text/html; charset=utf-8"
            } elseif ($path.EndsWith(".js")) {
                $res.ContentType = "application/javascript; charset=utf-8"
            } elseif ($path.EndsWith(".css")) {
                $res.ContentType = "text/css; charset=utf-8"
            } elseif ($path.EndsWith(".png")) {
                $res.ContentType = "image/png"
            }
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
            $res.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        $res.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}
