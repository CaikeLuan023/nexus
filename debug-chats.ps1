$headers = @{ 'X-Api-Key' = 'gestao-trabalho-waha-key' }

Write-Output "=== Status da sessao ==="
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/sessions/default' -Headers $headers -UseBasicParsing
    Write-Output $r.Content
} catch {
    Write-Output "Erro: $($_.Exception.Message)"
}

Write-Output "`n=== Chats (direto WAHA) ==="
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/default/chats' -Headers $headers -UseBasicParsing -TimeoutSec 30
    $content = $r.Content
    Write-Output "Status code: $($r.StatusCode)"
    Write-Output "Content length: $($content.Length)"
    # Show first 2000 chars
    if ($content.Length -gt 2000) {
        Write-Output $content.Substring(0, 2000)
        Write-Output "... (truncated)"
    } else {
        Write-Output $content
    }
} catch {
    Write-Output "Erro chats: $($_.Exception.Message)"
}

Write-Output "`n=== Chats (via server proxy) ==="
# Login first
$login = Invoke-WebRequest -Uri 'http://localhost:3000/api/login' -Method POST -ContentType 'application/json' -Body '{"usuario":"caike.luan","senha":"admin123"}' -SessionVariable sess -UseBasicParsing
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/whatsapp/chats' -WebSession $sess -UseBasicParsing -TimeoutSec 30
    Write-Output "Status code: $($r.StatusCode)"
    Write-Output "Content length: $($r.Content.Length)"
    if ($r.Content.Length -gt 2000) {
        Write-Output $r.Content.Substring(0, 2000)
        Write-Output "... (truncated)"
    } else {
        Write-Output $r.Content
    }
} catch {
    Write-Output "Erro proxy: $($_.Exception.Message)"
}
