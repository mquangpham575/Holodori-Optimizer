안녕하세요 HoloDreamers 여러분! 현재 **Hololive Dreams**는 지역 IP 제한(Region Lock)을 적용하고 있습니다. 이로 인해 지원되지 않는 국가(예: 베트남)에서는 게임을 다운로드하고 로그인하는 데 어려움이 있습니다.

다음은 최고의 게임 경험을 돕기 위한 **Android** 및 **Windows (PC)**용 단계별 가이드입니다.


# 파트 1: ANDROID

## 1. Android에서 다운로드하는 방법
Google Play 스토어의 게임 다운로드도 지역 제한이 걸려 있으므로 VPN을 사용하여 스토어 지역을 변경해야 합니다.

- **1단계**: Google Play 스토어 또는 기타 공식 소스에서 **VPN.lat** 앱을 설치합니다.
- **2단계**: 앱을 엽니다. VPN.lat의 메인 화면은 아래와 같습니다. 지원되는 지역(연결하려는 위치에 따라 미국, 베트남 등)을 선택합니다.
  
  ![VPN.lat 메인 UI](/blog/bypass-region-lock/imgs/android_vpn_ui.png)

- **3단계**: 해당 지역에서 사용 가능한 서버 중 하나를 선택하여 연결합니다.
  
  ![VPN.lat 서버 목록](/blog/bypass-region-lock/imgs/android_vpn_list.png)

- **4단계**: VPN이 연결되면 **기기 설정 -> 애플리케이션 -> Google Play 스토어 -> 저장공간 -> 캐시 삭제**를 진행합니다.
- **5단계**: Google Play 스토어를 다시 열고 **Hololive Dreams**를 검색하여 다운로드합니다.


## 2. Android에서 로그인하는 방법
- 게임이 설치되면 게임을 열고 로그인을 시도합니다.
- 플레이하는 동안 VPN.lat을 활성 상태로 유지하거나, 게임이 로드된 후 **VPN을 꺼서** VPN 없이 작동하는지 확인할 수 있습니다.
- 아래와 같은 연결 에러가 발생하는 경우:
  
  ![Android 데이터 연결 에러](/blog/bypass-region-lock/imgs/android_game_error.png)
  
  **VPN.lat**을 다시 켜고 게임을 재시작하여 해결하세요.

**참고:** 저자가 테스트한 결과 VPN.lat의 **US15** 및 **VN1, VN2, VN3** 서버가 가장 잘 작동합니다.


# 파트 2: WINDOWS (PC)

## 1. Windows에서 다운로드하는 방법
- Android와 달리 PC에서는 [Steam](https://store.steampowered.com/)을 통해 게임을 직접 다운로드할 수 있습니다.


## 2. Windows에서 로그인하는 방법
PC에서 아래와 같이 데이터 연결 에러(Failed to retrieve data)가 발생하는 경우:
  
![PC 데이터 연결 에러](/blog/bypass-region-lock/imgs/pc_game_error.png)
  
로그인 제한을 우회하기 위해 다음 단계에 따라 **SoftEther VPN Client**를 연결하거나 재연결하십시오.

- **1단계**: [SoftEther 다운로드 센터](https://www.softether-download.com/)를 방문하여 Windows용 최신 설치 프로그램을 다운로드합니다.
- **2단계**: 설치 프로그램을 실행하고 **SoftEther VPN Client** 옵션을 선택합니다.
- **3단계**: 완료될 때까지 **다음**을 클릭합니다. 가상 네트워크 어댑터 생성 여부를 묻는 메시지가 나타나면 동의합니다.
  
  ![SoftEther VPN 설정](/blog/bypass-region-lock/imgs/image.png)

- **4단계**: SoftEther VPN Client 창에서 **VPN Gate Public VPN Relay Servers**를 더블 클릭합니다.
- **5단계**: 지원되는 지역(예: 일본 또는 미국)의 서버를 선택합니다. **목록 새로고침**을 클릭하여 서버 목록을 갱신할 수 있습니다.
  
  ![VPN Gate 퍼블릭 릴레이 서버](/blog/bypass-region-lock/imgs/image-1.png)

- **6단계**: 연결 프로토콜(TCP 권장)을 선택하고 **연결**을 클릭합니다. 상태가 **연결됨**으로 표시되면 게임을 실행하여 정상적으로 플레이하세요!

**참고:** PC에서는 연결에 성공하기만 하면 **US**(미국), **JP**(일본) 또는 **VN**(베트남) 등 모든 지역을 사용하여 게임에 로그인할 수 있습니다.