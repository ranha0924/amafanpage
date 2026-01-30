// ========================================
// Firebase Configuration (Firestore)
// ========================================
//
// Firebase 설정 방법:
//
// 1. https://console.firebase.google.com/ 접속
// 2. "프로젝트 추가" 클릭
// 3. 프로젝트 이름 입력 (예: amf1-fanpage)
// 4. Google Analytics는 선택사항 (끄기 추천)
//
// 5. Firestore 데이터베이스 생성:
//    - 좌측 메뉴 "빌드" > "Firestore Database" 클릭
//    - "데이터베이스 만들기" 클릭
//    - "테스트 모드에서 시작" 선택
//    - 위치 선택: asia-northeast3 (서울) 추천
//    - "만들기" 클릭
//
// 6. 웹 앱 등록:
//    - 좌측 상단 톱니바퀴 > "프로젝트 설정"
//    - 스크롤 내려서 "내 앱" 섹션
//    - "</>" (웹) 아이콘 클릭
//    - 앱 닉네임 입력 후 "앱 등록"
//    - 표시되는 firebaseConfig 값을 아래에 복사
//
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyBxa1Zq_jty8FHcymG8WHnrjdvDLM4x43c",
  authDomain: "amf1-fanpage-13063.firebaseapp.com",
  projectId: "amf1-fanpage-13063",
  storageBucket: "amf1-fanpage-13063.firebasestorage.app",
  messagingSenderId: "869691536939",
  appId: "1:869691536939:web:8108f8ec955217fa1d9c6e"
};

// Firebase 초기화
let firebaseApp = null;
let db = null;
let auth = null;

try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log('Firebase 연결 성공!');
} catch (error) {
    console.warn('Firebase 연결 실패:', error);
}

// Firebase 연결 상태 확인
function isFirebaseConnected() {
    return db !== null && firebaseConfig.apiKey !== "YOUR_API_KEY";
}

// Auth 연결 상태 확인
function isAuthConnected() {
    return auth !== null && firebaseConfig.apiKey !== "YOUR_API_KEY";
}
