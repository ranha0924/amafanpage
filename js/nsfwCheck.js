// ========================================
// NSFW Image Check Module
// 클라이언트 측 이미지 검증 (nsfw.js)
// ========================================

// NSFW.js 모델 인스턴스
let nsfwModel = null;
let modelLoading = false;
let modelLoadPromise = null;

// NSFW 임계값 (60%)
const NSFW_THRESHOLD = 0.60;

// 최대 파일 크기 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 허용되는 MIME 타입
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// NSFW.js 모델 로드
async function loadNsfwModel() {
    if (nsfwModel) {
        return nsfwModel;
    }

    if (modelLoading && modelLoadPromise) {
        return modelLoadPromise;
    }

    modelLoading = true;
    modelLoadPromise = (async () => {
        try {
            console.log('NSFW.js 모델 로딩 시작...');
            // 기본 모델 로드 (인터넷 연결 필요)
            nsfwModel = await nsfwjs.load();
            console.log('NSFW.js 모델 로딩 완료!');
            return nsfwModel;
        } catch (error) {
            console.error('NSFW.js 모델 로딩 실패:', error);
            console.warn('NSFW 검사 없이 진행됩니다.');
            modelLoading = false;
            modelLoadPromise = null;
            // 모델 로딩 실패해도 null 반환 (검사 스킵)
            return null;
        }
    })();

    return modelLoadPromise;
}

// 파일 기본 검증 (크기, MIME 타입)
function validateFileBasics(file) {
    const errors = [];

    // 파일 크기 확인
    if (file.size > MAX_FILE_SIZE) {
        errors.push(`파일 크기가 너무 큽니다. (최대 ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
    }

    // MIME 타입 확인
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push('지원하지 않는 이미지 형식입니다. (JPG, PNG, GIF, WEBP만 가능)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Canvas를 사용하여 이미지 재렌더링 (메타데이터 조작 우회 방지)
function renderImageOnCanvas(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            try {
                // Canvas 생성
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 이미지 크기 설정 (최대 512px로 리사이즈하여 검사 속도 향상)
                const maxSize = 512;
                let width = img.width;
                let height = img.height;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                // 이미지를 Canvas에 그리기 (실제 픽셀 데이터로 변환)
                ctx.drawImage(img, 0, 0, width, height);

                URL.revokeObjectURL(objectUrl);
                resolve({ canvas, img });
            } catch (error) {
                URL.revokeObjectURL(objectUrl);
                reject(error);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('이미지를 로드할 수 없습니다.'));
        };

        img.src = objectUrl;
    });
}

// SHA-256 해시 생성
async function generateImageHash(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        console.error('해시 생성 실패:', error);
        return null;
    }
}

// NSFW 점수 계산
function calculateNsfwScore(predictions) {
    // Porn, Sexy, Hentai 카테고리의 확률 합산
    let nsfwScore = 0;
    const nsfwCategories = ['Porn', 'Sexy', 'Hentai'];

    for (const pred of predictions) {
        if (nsfwCategories.includes(pred.className)) {
            nsfwScore += pred.probability;
        }
    }

    return nsfwScore;
}

// 이미지 NSFW 검사 메인 함수
async function checkImageNsfw(file) {
    // 1. 기본 파일 검증
    const basicValidation = validateFileBasics(file);
    if (!basicValidation.valid) {
        return {
            safe: false,
            reason: 'validation',
            errors: basicValidation.errors,
            hash: null
        };
    }

    try {
        // 2. 모델 로드
        const model = await loadNsfwModel();

        // 3. 이미지 해시 생성
        const hash = await generateImageHash(file);

        // 모델 로딩 실패 시 검사 스킵 (이미지 허용)
        if (!model) {
            console.warn('NSFW 모델 없음 - 검사 스킵');
            return {
                safe: true,
                skipped: true,
                score: 0,
                predictions: [],
                hash
            };
        }

        // 4. Canvas에 이미지 렌더링 (메타데이터 우회 방지)
        const { canvas } = await renderImageOnCanvas(file);

        // 5. NSFW 검사
        const predictions = await model.classify(canvas);
        console.log('NSFW 검사 결과:', predictions);

        // 6. NSFW 점수 계산
        const nsfwScore = calculateNsfwScore(predictions);
        console.log(`NSFW 점수: ${(nsfwScore * 100).toFixed(2)}%`);

        // 7. 결과 반환
        if (nsfwScore >= NSFW_THRESHOLD) {
            return {
                safe: false,
                reason: 'nsfw',
                score: nsfwScore,
                predictions,
                hash
            };
        }

        return {
            safe: true,
            score: nsfwScore,
            predictions,
            hash
        };
    } catch (error) {
        console.error('이미지 검사 실패:', error);
        // 검사 실패 시에도 이미지 허용 (해시만 생성)
        const hash = await generateImageHash(file);
        console.warn('NSFW 검사 실패 - 이미지 허용');
        return {
            safe: true,
            skipped: true,
            error: error.message,
            hash
        };
    }
}

// 이미지 미리보기 생성
function createImagePreview(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result);
        };

        reader.onerror = () => {
            reject(new Error('이미지를 읽을 수 없습니다.'));
        };

        reader.readAsDataURL(file);
    });
}

// 페이지 로드 시 모델 미리 로드 (선택적)
document.addEventListener('DOMContentLoaded', () => {
    // 3초 후 백그라운드에서 모델 로드 시작
    setTimeout(() => {
        loadNsfwModel().catch(err => {
            console.warn('NSFW 모델 프리로드 실패 (필요 시 재시도됨):', err);
        });
    }, 3000);
});

// 전역 함수 내보내기
window.nsfwCheck = {
    checkImageNsfw,
    createImagePreview,
    loadNsfwModel,
    NSFW_THRESHOLD,
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES
};
