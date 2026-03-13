# Teste ngrok - verificar se esta ativo
try {
    $r = Invoke-WebRequest -Uri "https://aylin-flowerlike-cartographically.ngrok-free.dev/" -Method GET -Headers @{"ngrok-skip-browser-warning"="true"} -ErrorAction Stop -MaximumRedirection 0
    Write-Output "Ngrok GET Status: $($r.StatusCode)"
    Write-Output "Content-Length: $($r.Content.Length)"
    Write-Output "First 200 chars: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
} catch {
    Write-Output "Ngrok ERRO: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Output "Response body: $($body.Substring(0, [Math]::Min(300, $body.Length)))"
    }
}
