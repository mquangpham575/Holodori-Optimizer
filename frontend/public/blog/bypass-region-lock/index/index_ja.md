HoloDreamersの皆さん、こんにちは！現在、**Hololive Dreams**は地域IP制限（Region Lock）を実施しています。そのため、サポートされていない国（ベトナムなど）からゲームをダウンロードしてログインすることが困難になっています。

以下は、最高のゲーム体験を得るための **Android** および **Windows (PC)** のステップバイステップガイドです。


# パート1：ANDROID

## 1. Androidでのダウンロード方法
Google Playストアでのゲームダウンロードも地域制限されているため、VPNを使用してストアの地域を変更する必要があります。

- **ステップ1**：Google Playストアまたは他の公式ソースから **VPN.lat** アプリをインストールします。
- **ステップ2**：アプリを開きます。VPN.latのメイン画面は以下のようになります。サポートされている地域（接続したい場所に応じて、米国、ベトナムなど）を選択します。
  
  ![VPN.lat メインUI](/blog/bypass-region-lock/imgs/android_vpn_ui.png)

- **ステップ3**：その地域で利用可能なサーバーのいずれかを選択して接続します。
  
  ![VPN.lat サーバーリスト](/blog/bypass-region-lock/imgs/android_vpn_list.png)

- **ステップ4**：VPNが接続されたら、**端末の設定 -> アプリ -> Google Playストア -> ストレージ -> キャッシュを消去**します。
- **ステップ5**：Google Playストアを再度開き、**Hololive Dreams** を検索してダウンロードします。


## 2. Androidでのログイン方法
- ゲームがインストールされたら、ゲームを開いてログインを試みます。
- プレイ中はVPN.latを有効にしたままにするか、ゲームがロードされた後に **VPNをオフ** にしてみて、VPNなしで動作するか確認できます。
- 以下のような接続エラーが発生した場合：
  
  ![Android データ接続エラー](/blog/bypass-region-lock/imgs/android_game_error.png)
  
  **VPN.lat** を再度オンにしてゲームを再起動し、修正してください。

**注意：** 筆者がテストした結果、VPN.latの **US15** および **VN1、VN2、VN3** サーバーが最もよく機能することがわかりました。


# パート2：WINDOWS (PC)

## 1. Windowsでのダウンロード方法
- Androidとは異なり、PCでは [Steam](https://store.steampowered.com/) から直接ゲームをダウンロードできます。


## 2. Windowsでのログイン方法
PCで以下のようなデータ接続エラー（Failed to retrieve data）が発生した場合：
  
![PC データ接続エラー](/blog/bypass-region-lock/imgs/pc_game_error.png)
  
ログイン制限を回避するために、以下の手順で **SoftEther VPN Client** を接続または再接続してください。

- **ステップ1**：[SoftEther ダウンロードセンター](https://www.softether-download.com/) にアクセスし、Windows用の最新のインストーラーをダウンロードします。
- **ステップ2**：インストーラーを実行し、**SoftEther VPN Client** オプションを選択します。
- **ステップ3**：完了するまで **次へ** をクリックします。プロンプトが表示されたら、仮想ネットワークアダプターの作成に同意します。
  
  ![SoftEther VPN 設定](/blog/bypass-region-lock/imgs/image.png)

- **ステップ4**：SoftEther VPN Clientウィンドウの **VPN Gate Public VPN Relay Servers** をダブルクリックします。
- **ステップ5**：サポートされている地域（日本や米国など）のサーバーを選択します。**一覧を更新** をクリックして、サーバーリストを更新できます。
  
  ![VPN Gate パブリック中継サーバー](/blog/bypass-region-lock/imgs/image-1.png)

- **ステップ6**：接続プロトコル（**TCP** を推奨）を選択し、**接続** をクリックします。ステータスが **接続完了** になったら、ゲームを起動して通常通りプレイしてください！

**注意：** PCでは、接続が成功している限り、米国（**US**）、日本（**JP**）、またはベトナム（**VN**）などのすべての地域を使用してゲームにログインできます。