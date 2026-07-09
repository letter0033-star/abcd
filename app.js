// Firebase SDK CDN 임포트 (웹 배포 시 정상 작동합니다)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    addDoc, 
    updateDoc, 
    deleteDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase 설정정보 (프로젝트 ID: gift-be17b 적용)
// ⚠️ 중요: 깃허브 페이지 업로드 전, 본인의 Firebase 콘솔에서 발급받은 실제 apiKey와 appId 값으로 변경해주세요!
const firebaseConfig = {
    apiKey: "AIzaSyDummyKeyForDevelopment123456789", // 여기에 실제 API Key를 기입하세요.
    authDomain: "gift-be17b.firebaseapp.com",
    projectId: "gift-be17b",
    storageBucket: "gift-be17b.appspot.com",
    messagingSenderId: "1234567890", // 여기에 실제 Sender ID를 기입하세요.
    appId: "1:1234567890:web:abcdef123456789" // 여기에 실제 App ID를 기입하세요.
};

// 앱 상태 관리 객체
let isTeacherMode = false;
let currentClassId = null;
let classroomsData = {}; // 교실 및 소속 준비물 임시 저장소
let db = null;
let useOfflineFallback = false; // 클라우드 DB 연결을 위해 기본적으로 false 설정

// 초기 데모 데이터 (Firebase 연결이 실패했을 때에만 로드됨)
const DEFAULT_DEMO_DATA = {
    "demo_class_1": {
        id: "demo_class_1",
        className: "3학년 1반 (샘플)",
        teacherName: "홍길동 교사",
        supplies: [
            { name: "가위", qty: 25, status: "ready" },
            { name: "풀", qty: 25, status: "ready" },
            { name: "색종이", qty: 5, status: "pending" }
        ]
    }
};

// DOM 요소 캐시
const classroomGrid = document.getElementById("classroom-grid");
const btnMockAuth = document.getElementById("btn-mock-auth");
const btnAddClass = document.getElementById("btn-add-class");
const modalClass = document.getElementById("modal-class");
const modalSupplies = document.getElementById("modal-supplies");
const formClass = document.getElementById("form-class");
const formAddSupply = document.getElementById("form-add-supply");
const supplyListBody = document.getElementById("supply-list-body");
const btnDeleteClass = document.getElementById("btn-delete-class");

// 요약 통계 요소 캐시
const statTotalClasses = document.getElementById("stat-total-classes");
const statReadyClasses = document.getElementById("stat-ready-classes");
const statPendingClasses = document.getElementById("stat-pending-classes");

// 모달 상세 정보 타이틀 요소 캐시
const detailClassTitle = document.getElementById("detail-class-title");
const detailTeacherName = document.getElementById("detail-teacher-name");

// 애플리케이션 초기화
function init() {
    setupAuthToggle();
    setupModalEvents();
    
    try {
        // Firebase 앱 초기화 및 Firestore 인스턴스 가져오기
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        
        // Firestore 연결 및 실시간 데이터 리스너 작동
        setupFirestoreRealtime();
    } catch (error) {
        console.warn("Firebase 연결 오류 (API key 누락 또는 오프라인). 데모 모드로 전환합니다.", error);
        enableOfflineFallback();
    }
}

// 오프라인 폴백 모드 활성화 (LocalStorage 활용)
function enableOfflineFallback() {
    useOfflineFallback = true;
    
    if (!localStorage.getItem("readyclass_data")) {
        localStorage.setItem("readyclass_data", JSON.stringify(DEFAULT_DEMO_DATA));
    }
    
    classroomsData = JSON.parse(localStorage.getItem("readyclass_data"));
    renderDashboard();
    
    const banner = document.createElement("div");
    banner.style.cssText = "grid-column: 1/-1; background: rgba(250,168,26,0.1); border: 1px solid rgba(250,168,26,0.3); border-radius: 12px; padding: 12px 20px; font-size: 0.9rem; text-align: center; color: #faa81a; margin-bottom: 15px;";
    banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i> Firebase API 설정이 누락되어 <strong>로컬 데모 모드</strong>로 연결되었습니다. 클라우드 연동을 원하시면 app.js에 실제 API 키를 입력해주세요.`;
    classroomGrid.prepend(banner);
}

// 오프라인 데이터 로컬 저장 유틸
function saveOfflineData() {
    localStorage.setItem("readyclass_data", JSON.stringify(classroomsData));
    renderDashboard();
    if (currentClassId) {
        renderSuppliesList(currentClassId);
    }
}

// 교사 모드 토글 기능 설정
function setupAuthToggle() {
    btnMockAuth.addEventListener("click", () => {
        isTeacherMode = !isTeacherMode;
        if (isTeacherMode) {
            document.body.classList.add("auth-teacher");
            btnMockAuth.innerHTML = `<i class="fa-solid fa-user-lock"></i> 일반 뷰어로 전환`;
            btnMockAuth.style.backgroundColor = "rgba(59, 165, 93, 0.2)";
        } else {
            document.body.classList.remove("auth-teacher");
            btnMockAuth.innerHTML = `<i class="fa-solid fa-user-shield"></i> 교사 모드 전환`;
            btnMockAuth.style.backgroundColor = "";
        }
        renderDashboard();
        if (currentClassId) {
            renderSuppliesList(currentClassId);
        }
    });
}

// 모달 표시 및 닫기 바인딩
function setupModalEvents() {
    btnAddClass.addEventListener("click", () => {
        document.getElementById("class-modal-title").innerHTML = `<i class="fa-solid fa-school-flag"></i> 새 교실 등록`;
        document.getElementById("input-class-id").value = "";
        formClass.reset();
        openModal(modalClass);
    });

    document.querySelectorAll(".close-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const targetModal = document.getElementById(e.target.dataset.modal);
            closeModal(targetModal);
        });
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal")) {
            closeModal(e.target);
        }
    });

    formClass.addEventListener("submit", async (e) => {
        e.preventDefault();
        const classId = document.getElementById("input-class-id").value;
        const className = document.getElementById("input-class-name").value;
        const teacherName = document.getElementById("input-teacher-name").value;

        if (useOfflineFallback) {
            if (classId) {
                classroomsData[classId].className = className;
                classroomsData[classId].teacherName = teacherName;
            } else {
                const newId = "class_" + Date.now();
                classroomsData[newId] = {
                    id: newId,
                    className: className,
                    teacherName: teacherName,
                    supplies: []
                };
            }
            saveOfflineData();
        } else {
            try {
                if (classId) {
                    await updateDoc(doc(db, "classrooms", classId), { className, teacherName });
                } else {
                    await addDoc(collection(db, "classrooms"), { 
                        className, 
                        teacherName, 
                        createdAt: Date.now() 
                    });
                }
            } catch (err) {
                console.error("Firestore 저장 실패", err);
            }
        }
        closeModal(modalClass);
    });

    formAddSupply.addEventListener("submit", async (e) => {
        e.preventDefault();
        const sName = document.getElementById("input-supply-name").value;
        const sQty = parseInt(document.getElementById("input-supply-qty").value);
        const sStatus = document.getElementById("input-supply-status").value;

        if (!currentClassId) return;

        if (useOfflineFallback) {
            classroomsData[currentClassId].supplies.push({
                name: sName,
                qty: sQty,
                status: sStatus
            });
            saveOfflineData();
        } else {
            try {
                await addDoc(collection(db, "classrooms", currentClassId, "supplies"), {
                    name: sName,
                    qty: sQty,
                    status: sStatus,
                    createdAt: Date.now()
                });
            } catch (err) {
                console.error("Firestore 준비물 추가 실패", err);
            }
        }
        formAddSupply.reset();
    });

    btnDeleteClass.addEventListener("click", async () => {
        if (!currentClassId) return;
        if (!confirm("정말로 이 교실 정보와 모든 준비물 현황을 삭제하시겠습니까?")) return;

        if (useOfflineFallback) {
            delete classroomsData[currentClassId];
            saveOfflineData();
            closeModal(modalSupplies);
        } else {
            try {
                await deleteDoc(doc(db, "classrooms", currentClassId));
                closeModal(modalSupplies);
            } catch (err) {
                console.error("Firestore 교실 삭제 실패", err);
            }
        }
    });
}

function openModal(modalEl) {
    modalEl.classList.add("show");
}

function closeModal(modalEl) {
    modalEl.classList.remove("show");
    if (modalEl === modalSupplies) {
        currentClassId = null;
    }
}

// Firestore 실시간 데이터 수신 및 실시간 상태 동기화
function setupFirestoreRealtime() {
    const classQuery = query(collection(db, "classrooms"));
    
    onSnapshot(classQuery, (snapshot) => {
        classroomsData = {};
        
        if (snapshot.empty) {
            renderDashboard();
            return;
        }

        snapshot.forEach((classDoc) => {
            const classId = classDoc.id;
            const data = classDoc.data();
            
            classroomsData[classId] = {
                id: classId,
                className: data.className,
                teacherName: data.teacherName,
                supplies: []
            };

            const supplyQuery = query(collection(db, "classrooms", classId, "supplies"), orderBy("createdAt", "asc"));
            onSnapshot(supplyQuery, (supplySnapshot) => {
                const suppliesArr = [];
                supplySnapshot.forEach((sDoc) => {
                    suppliesArr.push({
                        id: sDoc.id,
                        name: sDoc.data().name,
                        qty: sDoc.data().qty,
                        status: sDoc.data().status
                    });
                });
                
                classroomsData[classId].supplies = suppliesArr;
                
                if (currentClassId === classId) {
                    renderSuppliesList(classId);
                }
                renderDashboard();
            });
        });
    }, (error) => {
        console.error("Firestore 연결 중 에러 발생 (권한 규칙 부족 또는 API Key 에러)", error);
        enableOfflineFallback();
    });
}

// 대시보드 렌더링
function renderDashboard() {
    classroomGrid.innerHTML = "";
    const classList = Object.values(classroomsData);
    
    if (classList.length === 0) {
        classroomGrid.innerHTML = `
            <div class="loading-spinner">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; opacity: 0.5;"></i>
                <p>등록된 교실이 없습니다. ${isTeacherMode ? '새 교실 추가를 클릭하여 시작하세요!' : '교사 모드 전환 후 교실을 추가할 수 있습니다.'}</p>
            </div>`;
        updateStats(0, 0, 0);
        return;
    }

    let readyClassesCount = 0;
    let pendingClassesCount = 0;

    classList.forEach((classroom) => {
        const supplies = classroom.supplies || [];
        let overallStatus = "ready";
        let statusBadgeText = "준비완료";
        
        if (supplies.length === 0) {
            overallStatus = "needed";
            statusBadgeText = "미비(항목없음)";
        } else {
            const hasNeeded = supplies.some(s => s.status === "needed");
            const hasPending = supplies.some(s => s.status === "pending");
            
            if (hasNeeded) {
                overallStatus = "needed";
                statusBadgeText = "준비물부족";
            } else if (hasPending) {
                overallStatus = "pending";
                statusBadgeText = "준비진행중";
            }
        }

        if (overallStatus === "ready") {
            readyClassesCount++;
        } else {
            pendingClassesCount++;
        }

        const card = document.createElement("div");
        card.className = `class-card ${overallStatus === 'ready' ? 'all-ready' : overallStatus === 'pending' ? 'partial-ready' : ''}`;
        
        let previewHtml = "";
        if (supplies.length === 0) {
            previewHtml = `<li style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">등록된 학습준비물이 없습니다.</li>`;
        } else {
            supplies.slice(0, 3).forEach(s => {
                previewHtml += `
                    <li>
                        <span class="supply-name">
                            <span class="supply-dot ${s.status}"></span>
                            ${s.name}
                        </span>
                        <span class="supply-qty">${s.qty}개</span>
                    </li>
                `;
            });
            if (supplies.length > 3) {
                previewHtml += `<li style="font-size:0.8rem; color: var(--text-muted); text-align: center; justify-content: center; border-bottom: none; padding-top: 10px;">외 ${supplies.length - 3}개 품목이 더 있습니다.</li>`;
            }
        }

        card.innerHTML = `
            <div class="class-card-header">
                <div class="class-title">
                    <h3>${classroom.className}</h3>
                    <span>담당: ${classroom.teacherName}</span>
                </div>
                <span class="status-badge ${overallStatus}">${statusBadgeText}</span>
            </div>
            <div class="class-card-body">
                <ul class="supplies-preview">
                    ${previewHtml}
                </ul>
            </div>
            <div class="class-card-footer">
                <button class="btn-card-action" onclick="window.viewSupplies('${classroom.id}')">
                    <i class="fa-solid fa-list-check"></i> 현황 상세관리
                </button>
                <div class="edit-actions ${isTeacherMode ? '' : 'hidden-guest'}">
                    <button class="icon-btn" title="교실 수정" onclick="window.editClass('${classroom.id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </div>
        `;
        classroomGrid.appendChild(card);
    });

    updateStats(classList.length, readyClassesCount, pendingClassesCount);
}

// 요약 통계 정보 업데이트
function updateStats(total, ready, pending) {
    statTotalClasses.textContent = `${total}개 반`;
    statReadyClasses.textContent = `${ready}개 반`;
    statPendingClasses.textContent = `${pending}개 반`;
}

// 교실 상세 보기 및 준비물 목록 렌더링
window.viewSupplies = function(classId) {
    currentClassId = classId;
    const classroom = classroomsData[classId];
    if (!classroom) return;

    detailClassTitle.innerHTML = `<i class="fa-solid fa-clipboard-list"></i> ${classroom.className} 준비물 목록`;
    detailTeacherName.textContent = `담임 교사: ${classroom.teacherName}`;
    
    renderSuppliesList(classId);
    openModal(modalSupplies);
};

// 준비물 목록 상세 테이블 렌더링
function renderSuppliesList(classId) {
    supplyListBody.innerHTML = "";
    const classroom = classroomsData[classId];
    if (!classroom) return;

    const supplies = classroom.supplies || [];

    if (supplies.length === 0) {
        supplyListBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">등록된 준비물이 없습니다. ${isTeacherMode ? '상단 입력폼에서 추가하세요.' : ''}</td></tr>`;
        return;
    }

    supplies.forEach((supply, index) => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        let statusText = "";
        if (supply.status === "ready") { statusBadge = "ready"; statusText = "✅ 완료"; }
        else if (supply.status === "pending") { statusBadge = "pending"; statusText = "⚠️ 준비중"; }
        else { statusBadge = "needed"; statusText = "❌ 미비"; }

        const statusHtml = isTeacherMode 
            ? `<button class="status-pill ${statusBadge}" onclick="window.toggleSupplyStatus('${classId}', ${index}, '${supply.id || ''}')">${statusText}</button>`
            : `<span class="status-badge ${statusBadge}">${statusText}</span>`;

        const actionsHtml = isTeacherMode
            ? `<button class="icon-btn" style="color:var(--danger);" onclick="window.deleteSupply('${classId}', ${index}, '${supply.id || ''}')"><i class="fa-solid fa-trash"></i></button>`
            : `-`;

        tr.innerHTML = `
            <td><strong>${supply.name}</strong></td>
            <td>${supply.qty} 개</td>
            <td>${statusHtml}</td>
            <td class="${isTeacherMode ? '' : 'hidden-guest'}">${actionsHtml}</td>
        `;
        supplyListBody.appendChild(tr);
    });
}

// 교실명/담임명 편집 모달 열기
window.editClass = function(classId) {
    const classroom = classroomsData[classId];
    if (!classroom) return;

    document.getElementById("class-modal-title").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> 교실 정보 수정`;
    document.getElementById("input-class-id").value = classId;
    document.getElementById("input-class-name").value = classroom.className;
    document.getElementById("input-teacher-name").value = classroom.teacherName;

    openModal(modalClass);
};

// 준비물 상태 순차적으로 변경
window.toggleSupplyStatus = async function(classId, index, supplyId) {
    if (!isTeacherMode) return;
    
    const classroom = classroomsData[classId];
    if (!classroom) return;

    const statuses = ["needed", "pending", "ready"];
    const currentStatus = classroom.supplies[index].status;
    const nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];

    if (useOfflineFallback) {
        classroom.supplies[index].status = nextStatus;
        saveOfflineData();
    } else {
        try {
            await updateDoc(doc(db, "classrooms", classId, "supplies", supplyId), {
                status: nextStatus
            });
        } catch (err) {
            console.error("준비물 상태 업데이트 실패", err);
        }
    }
};

// 준비물 삭제
window.deleteSupply = async function(classId, index, supplyId) {
    if (!isTeacherMode) return;
    if (!confirm("이 준비물 항목을 삭제하시겠습니까?")) return;

    if (useOfflineFallback) {
        classroomsData[classId].supplies.splice(index, 1);
        saveOfflineData();
    } else {
        try {
            await deleteDoc(doc(db, "classrooms", classId, "supplies", supplyId));
        } catch (err) {
            console.error("준비물 삭제 실패", err);
        }
    }
};

// 앱 초기화 구동
init();
