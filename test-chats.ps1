$headers = @{ 'X-Api-Key' = 'gestao-trabalho-waha-key' }

Write-Output "=== Teste chats com limit=20 (direto WAHA) ==="
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/default/chats?limit=20&sortBy=lastMessageTimestamp&sortOrder=desc' -Headers $headers -UseBasicParsing -TimeoutSec 30
    Write-Output "Status: $($r.StatusCode) | Length: $($r.Content.Length)"
    if ($r.Content.Length -gt 500) {
        Write-Output $r.Content.Substring(0, 500)
    } else {
        Write-Output $r.Content
    }
} catch {
    Write-Output "Erro: $($_.Exception.Message)"
}

Write-Output "`n=== Teste chats com limit=50 (direto WAHA) ==="
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/default/chats?limit=50&sortBy=lastMessageTimestamp&sortOrder=desc' -Headers $headers -UseBasicParsing -TimeoutSec 30
    Write-Output "Status: $($r.StatusCode) | Length: $($r.Content.Length)"
} catch {
    Write-Output "Erro: $($_.Exception.Message)"
}

Write-Output "`n=== Teste sem limit (direto WAHA) ==="
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/default/chats' -Headers $headers -UseBasicParsing -TimeoutSec 30
    Write-Output "Status: $($r.StatusCode) | Length: $($r.Content.Length)"
} catch {
    Write-Output "Erro: $($_.Exception.Message)"
}
