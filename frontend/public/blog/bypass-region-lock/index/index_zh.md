親愛的 HoloDreamers！目前，**Hololive Dreams** 實施了地區 IP 限制（Region Lock）。這使得從不支援的國家（如越南）下載和登入遊戲變得困難。

以下是針對 **Android** 和 **Windows (PC)** 的分步指南，以幫助您獲得最佳的遊戲體驗。


# 第 1 部分：ANDROID

## 1. 如何在 Android 上下載
由於 Google Play 商店的遊戲下載也受到地區限制，您需要使用 VPN 更改商店地區：

- **步驟 1**：從 Google Play 商店或其他官方來源安裝 **VPN.lat** 應用程式。
- **步驟 2**：打開應用程式。VPN.lat 的主畫面如下所示。選擇一個支援的地區（如美國、越南等，取決於您想連接的地方）。
  
  ![VPN.lat 主介面](/blog/bypass-region-lock/imgs/android_vpn_ui.png)

- **步驟 3**：選擇該地區內可用的伺服器之一進行連接。
  
  ![VPN.lat 伺服器列表](/blog/bypass-region-lock/imgs/android_vpn_list.png)

- **步驟 4**：連接 VPN 後，前往**裝置設定 -> 應用程式 -> Google Play 商店 -> 儲存空間 -> 清除快取**。
- **步驟 5**：重新打開 Google Play 商店，搜尋 **Hololive Dreams** 並下載。


## 2. 如何在 Android 上登入
- 遊戲安裝完成後，打開遊戲並嘗試登入。
- 您可以在遊玩時保持 VPN.lat 處於啟用狀態，或者可以在遊戲載入後嘗試**關閉 VPN**，看看是否可以正常運作。
- 如果遇到如下圖所示的連接錯誤：
  
  ![Android 數據連接錯誤](/blog/bypass-region-lock/imgs/android_game_error.png)
  
  請重新開啟 **VPN.lat** 並重啟遊戲以修復此問題。

**注意：** 作者測試發現，VPN.lat 中的 **US15** 以及 **VN1, VN2, VN3** 伺服器效果最好。


# 第 2 部分：WINDOWS (PC)

## 1. 如何在 Windows 上下載
- 與 Android 不同，在 PC 上，您可以直接透過 [Steam](https://store.steampowered.com/) 下載遊戲。


## 2. 如何在 Windows 上登入
如果您在 PC 上遇到如下圖所示的數據連接錯誤（Failed to retrieve data）：
  
![PC 數據連接錯誤](/blog/bypass-region-lock/imgs/pc_game_error.png)
  
請按照以下步驟連接或重新連接 **SoftEther VPN Client** 以繞過登入限制：

- **步驟 1**：造訪 [SoftEther 下載中心](https://www.softether-download.com/) 並下載適用於 Windows 的最新安裝程式。
- **步驟 2**：執行安裝程式，並選擇 **SoftEther VPN Client** 選項。
- **步驟 3**：按**下一步**直到完成。如果出現提示，請同意建立虛擬網路介面卡。
  
  ![SoftEther VPN 設定](/blog/bypass-region-lock/imgs/image.png)

- **步驟 4**：在 SoftEther VPN Client 視窗中按兩下 **VPN Gate Public VPN Relay Servers**。
- **步驟 5**：選擇支援地區（例如日本或美國）的伺服器。您可以按**重新整理清單**來更新伺服器列表。
  
  ![VPN Gate 公共中繼伺服器](/blog/bypass-region-lock/imgs/image-1.png)

- **步驟 6**：選擇連線協定（推薦 **TCP**）並按**連線**。當狀態顯示為 **已連線** 時，啟動遊戲即可正常遊玩！

**注意：** 在 PC 上，只要連線成功，美國（**US**）、日本（**JP**）或越南（**VN**）等所有地區均可用於登入遊戲。