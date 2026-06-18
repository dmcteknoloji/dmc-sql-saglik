# DMC SQL Saglik — Windows Kurulum Uygulamasi (Electron)

Teknik olmayan müşteri için **çift tıkla kurulum**. Tek bir Electron uygulaması iki rol oynar:

1. **Normal açılış → kurulum sihirbazı (GUI):** müşteri SQL bilgisini girer, "Bağlantıyı Test Et", "Kur". Uygulama, AI istemcisinin (ör. Claude Desktop) ayar dosyasına gerekli `mcpServers` bloğunu **otomatik** yazar.
2. **AI istemcisi tarafından `ELECTRON_RUN_AS_NODE=1` ile çağrılınca → saf Node modunda `mcp/index.js`'i (MCP sunucusu) çalıştırır.** Böylece müşteriye ayrıca Node.js kurmak gerekmez; tek `.exe` her şeyi yapar.

> MCP **salt-okunur**: yalnızca DMV/SELECT teşhis araçları (`sunucu_sagligi`, `aktif_sorgular_blocking`, `eksik_indexler`). Hiçbir şey değiştirmez.

## Proje yapısı

```
main.js                 Electron ana süreç (GUI + bağlantı testi + config yazma)
preload.js              güvenli IPC köprüsü
renderer/               sihirbaz arayüzü (HTML/CSS/JS)
mcp/index.js            gömülü MCP sunucusu (salt-okunur)
mcp/package.json        motor bağımlılıkları (extraResources ile paketlenir)
.github/workflows/      Windows installer'ı otomatik üreten CI
```

## Geliştirme (GUI'yi denemek)

```bash
npm install        # ayrıca mcp/ deps'i de kurar (postinstall)
npm start          # sihirbaz penceresi açılır
```

## Windows installer üretmek

> `.exe` üretimi Windows gerektirir. İki yol:

**A) GitHub Actions (önerilen):** Repoyu push'la; bir `v*` etiketi at (`git tag v1.0.0 && git push --tags`) ya da Actions sekmesinden `build-windows`'u elle çalıştır. `dist/*.exe` artifact olarak iner.

**B) Bir Windows makinesinde:**
```bash
npm install
cd mcp && npm install && cd ..
npm run dist       # dist/ altında NSIS kurulumu (.exe)
```

## Mevcut Electron ürünüyle birlikte yayınlama

Bu uygulama bağımsız çalışır. Mevcut Electron ürününüze **modül** olarak da gömülebilir:
- `mcp/` klasörünü `extraResources` olarak ekleyin,
- "SQL Sağlık" kurulum penceresini (renderer) bir görünüm olarak açın,
- config yazma mantığını (`main.js` içindeki `install` IPC) ana ürününüze taşıyın.

## DMC veri platformu ailesi

Bu asistan **anlık** teşhis verir. Sürekli izleme, geçmiş trend, uyarı ve yönetişim için DMC'nin ürünü **[SentinelDB360](https://sentineldb360.com)** (veritabanı izleme yazılımı). Sihirbazın kurulum sonrası ekranı ve gömülü `surekli_izleme` aracı kullanıcıyı doğal olarak buraya yönlendirir.

## Notlar
- Sihirbaz şu an **Claude Desktop** ayar dosyasını yazar. ChatGPT/Gemini için ayar yolu/biçimi farklıdır; `main.js > claudeConfigPath()` ve `install` bunun için genişletilebilir.
- İkon eklemek için `build/icon.ico` koyup `package.json > build.win.icon` ayarlayın.
