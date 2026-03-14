// ========================================
// F1 Teams Data & Theme System
// ========================================
(function() {
    'use strict';

    // 11개 F1 팀 데이터 (2026 시즌)
    var F1_TEAMS = {
        'aston-martin': {
            id: 'aston-martin',
            name: 'Aston Martin',
            nameKo: '애스턴마틴',
            primary: '#229971',
            primaryRgb: '34, 153, 113',
            primaryDark: '#1B7A5A',
            primaryDarker: '#145C44',
            primaryDarkest: '#0E3D2D',
            primaryLight: '#43A886',
            primaryLighter: '#64B89C',
            primaryDarkRgb: '27, 122, 90',
            primaryLightRgb: '67, 168, 134',
            secondary: '#CEDC00',
            secondaryRgb: '206, 220, 0',
            textOnBrand: '#ffffff',
            keywords: ['aston martin', 'aston', 'amr', 'alonso', 'stroll'],
            imageSlug: 'astonmartin',
            drivers: [
                { name: 'Fernando Alonso', code: 'feralo' },
                { name: 'Lance Stroll', code: 'lanstr' }
            ]
        },
        'red-bull': {
            id: 'red-bull',
            name: 'Red Bull',
            nameKo: '레드불',
            primary: '#3671C6',
            primaryRgb: '54, 113, 198',
            primaryDark: '#2B5A9E',
            primaryDarker: '#204477',
            primaryDarkest: '#162D4F',
            primaryLight: '#5486CF',
            primaryLighter: '#729CD7',
            primaryDarkRgb: '43, 90, 158',
            primaryLightRgb: '84, 134, 207',
            secondary: '#F91536',
            secondaryRgb: '249, 21, 54',
            textOnBrand: '#ffffff',
            keywords: ['red bull', 'redbull', 'verstappen', 'hadjar'],
            imageSlug: 'redbullracing',
            drivers: [
                { name: 'Max Verstappen', code: 'maxver' },
                { name: 'Isack Hadjar', code: 'isahad' }
            ]
        },
        'mclaren': {
            id: 'mclaren',
            name: 'McLaren',
            nameKo: '맥라렌',
            primary: '#FF8000',
            primaryRgb: '255, 128, 0',
            primaryDark: '#CC6600',
            primaryDarker: '#994D00',
            primaryDarkest: '#663300',
            primaryLight: '#FF9933',
            primaryLighter: '#FFB366',
            primaryDarkRgb: '204, 102, 0',
            primaryLightRgb: '255, 153, 51',
            secondary: '#47C7FC',
            secondaryRgb: '71, 199, 252',
            textOnBrand: '#000000',
            keywords: ['mclaren', 'norris', 'piastri'],
            imageSlug: 'mclaren',
            drivers: [
                { name: 'Lando Norris', code: 'lannor' },
                { name: 'Oscar Piastri', code: 'oscpia' }
            ]
        },
        'ferrari': {
            id: 'ferrari',
            name: 'Ferrari',
            nameKo: '페라리',
            primary: '#E8002D',
            primaryRgb: '232, 0, 45',
            primaryDark: '#BA0024',
            primaryDarker: '#8C001B',
            primaryDarkest: '#5E0012',
            primaryLight: '#FF1A47',
            primaryLighter: '#FF4D6F',
            primaryDarkRgb: '186, 0, 36',
            primaryLightRgb: '255, 26, 71',
            secondary: '#FFEB3B',
            secondaryRgb: '255, 235, 59',
            textOnBrand: '#ffffff',
            keywords: ['ferrari', 'hamilton', 'leclerc'],
            imageSlug: 'ferrari',
            drivers: [
                { name: 'Lewis Hamilton', code: 'lewham' },
                { name: 'Charles Leclerc', code: 'chalec' }
            ]
        },
        'mercedes': {
            id: 'mercedes',
            name: 'Mercedes',
            nameKo: '메르세데스',
            primary: '#27F4D2',
            primaryRgb: '39, 244, 210',
            primaryDark: '#1FC3A8',
            primaryDarker: '#17927E',
            primaryDarkest: '#106254',
            primaryLight: '#48F6D9',
            primaryLighter: '#6DF8E1',
            primaryDarkRgb: '31, 195, 168',
            primaryLightRgb: '72, 246, 217',
            secondary: '#C0C0C0',
            secondaryRgb: '192, 192, 192',
            textOnBrand: '#000000',
            keywords: ['mercedes', 'russell', 'antonelli'],
            imageSlug: 'mercedes',
            drivers: [
                { name: 'George Russell', code: 'georus' },
                { name: 'Kimi Antonelli', code: 'andant' }
            ]
        },
        'alpine': {
            id: 'alpine',
            name: 'Alpine',
            nameKo: '알핀',
            primary: '#00A1E8',
            primaryRgb: '0, 161, 232',
            primaryDark: '#0081BA',
            primaryDarker: '#00618B',
            primaryDarkest: '#00405D',
            primaryLight: '#26AFEB',
            primaryLighter: '#4DBDEF',
            primaryDarkRgb: '0, 129, 186',
            primaryLightRgb: '38, 175, 235',
            secondary: '#E12319',
            secondaryRgb: '225, 35, 25',
            textOnBrand: '#ffffff',
            keywords: ['alpine', 'gasly', 'colapinto'],
            imageSlug: 'alpine',
            drivers: [
                { name: 'Pierre Gasly', code: 'piegas' },
                { name: 'Franco Colapinto', code: 'fracol' }
            ]
        },
        'williams': {
            id: 'williams',
            name: 'Williams',
            nameKo: '윌리엄스',
            primary: '#1868DB',
            primaryRgb: '24, 104, 219',
            primaryDark: '#1353AF',
            primaryDarker: '#0E3E83',
            primaryDarkest: '#0A2A58',
            primaryLight: '#3B7FE0',
            primaryLighter: '#5D95E6',
            primaryDarkRgb: '19, 83, 175',
            primaryLightRgb: '59, 127, 224',
            secondary: '#00247D',
            secondaryRgb: '0, 36, 125',
            textOnBrand: '#ffffff',
            keywords: ['williams', 'sainz', 'albon'],
            imageSlug: 'williams',
            drivers: [
                { name: 'Alexander Albon', code: 'alealb' },
                { name: 'Carlos Sainz', code: 'carsai' }
            ]
        },
        'rb': {
            id: 'rb',
            name: 'Racing Bulls',
            nameKo: '레이싱 불스',
            primary: '#6692FF',
            primaryRgb: '102, 146, 255',
            primaryDark: '#5275CC',
            primaryDarker: '#3D5899',
            primaryDarkest: '#293A66',
            primaryLight: '#7DA2FF',
            primaryLighter: '#94B3FF',
            primaryDarkRgb: '82, 117, 204',
            primaryLightRgb: '125, 162, 255',
            secondary: '#F0382B',
            secondaryRgb: '240, 56, 43',
            textOnBrand: '#000000',
            keywords: ['racing bulls', 'rb', 'lawson', 'lindblad'],
            imageSlug: 'racingbulls',
            drivers: [
                { name: 'Liam Lawson', code: 'lialaw' },
                { name: 'Arvid Lindblad', code: 'arvlin' }
            ]
        },
        'haas': {
            id: 'haas',
            name: 'Haas',
            nameKo: '하스',
            primary: '#DEE1E2',
            primaryRgb: '222, 225, 226',
            primaryDark: '#B2B4B5',
            primaryDarker: '#858788',
            primaryDarkest: '#595A5A',
            primaryLight: '#E4E6E7',
            primaryLighter: '#EBECED',
            primaryDarkRgb: '178, 180, 181',
            primaryLightRgb: '228, 230, 231',
            secondary: '#E60012',
            secondaryRgb: '230, 0, 18',
            textOnBrand: '#000000',
            keywords: ['haas', 'ocon', 'bearman'],
            imageSlug: 'haasf1team',
            drivers: [
                { name: 'Oliver Bearman', code: 'olibea' },
                { name: 'Esteban Ocon', code: 'estoco' }
            ]
        },
        'audi': {
            id: 'audi',
            name: 'Audi',
            nameKo: '아우디',
            primary: '#FF2D00',
            primaryRgb: '255, 45, 0',
            primaryDark: '#CC2400',
            primaryDarker: '#991B00',
            primaryDarkest: '#661200',
            primaryLight: '#FF4D26',
            primaryLighter: '#FF6C4D',
            primaryDarkRgb: '204, 36, 0',
            primaryLightRgb: '255, 77, 38',
            secondary: '#C0C0C0',
            secondaryRgb: '192, 192, 192',
            textOnBrand: '#ffffff',
            keywords: ['audi', 'sauber', 'bortoleto', 'hulkenberg'],
            imageSlug: 'audi',
            drivers: [
                { name: 'Nico Hulkenberg', code: 'nichul' },
                { name: 'Gabriel Bortoleto', code: 'gabbor' }
            ]
        },
        'cadillac': {
            id: 'cadillac',
            name: 'Cadillac',
            nameKo: '캐딜락',
            primary: '#AAAAAD',
            primaryRgb: '170, 170, 173',
            primaryDark: '#88888A',
            primaryDarker: '#666668',
            primaryDarkest: '#444445',
            primaryLight: '#B7B7B9',
            primaryLighter: '#C4C4C6',
            primaryDarkRgb: '136, 136, 138',
            primaryLightRgb: '183, 183, 185',
            secondary: '#1E1E1E',
            secondaryRgb: '30, 30, 30',
            textOnBrand: '#000000',
            keywords: ['cadillac', 'bottas', 'perez'],
            imageSlug: 'cadillac',
            drivers: [
                { name: 'Valtteri Bottas', code: 'valbot' },
                { name: 'Sergio Perez', code: 'serper' }
            ]
        }
    };

    // 드라이버 얼굴 이미지 URL (F1 공식 CDN)
    function getTeamDriverImageUrl(code, imageSlug) {
        return 'https://media.formula1.com/image/upload/f_auto,c_lfill,w_256'
            + '/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp'
            + '/v1740000000/common/f1/2026/' + imageSlug + '/' + code + '01'
            + '/2026' + imageSlug + code + '01right.webp';
    }

    // 테마 적용 (CSS 변수 교체)
    function applyTeamTheme(teamId) {
        var team = F1_TEAMS[teamId];
        if (!team) return;
        var s = document.documentElement.style;

        // 1. 브랜드 색상 (9개 변수)
        s.setProperty('--color-brand', team.primary);
        s.setProperty('--color-brand-dark', team.primaryDark);
        s.setProperty('--color-brand-darker', team.primaryDarker);
        s.setProperty('--color-brand-darkest', team.primaryDarkest);
        s.setProperty('--color-brand-light', team.primaryLight);
        s.setProperty('--color-brand-lighter', team.primaryLighter);
        s.setProperty('--color-brand-rgb', team.primaryRgb);
        s.setProperty('--color-brand-dark-rgb', team.primaryDarkRgb);
        s.setProperty('--color-brand-light-rgb', team.primaryLightRgb);

        // 2. accent = 팀 secondary (코인 색상은 건드리지 않음)
        s.setProperty('--color-lime', team.secondary);
        s.setProperty('--color-lime-rgb', team.secondaryRgb);

        // 3. secondary 단독 변수 (인터랙티브 확대용)
        s.setProperty('--color-secondary', team.secondary);
        s.setProperty('--color-secondary-rgb', team.secondaryRgb);

        // 4. 브랜드 위 텍스트 대비 (밝은 팀용)
        s.setProperty('--text-on-brand', team.textOnBrand || '#ffffff');

        // 5. 팀 그래디언트 시그니처
        s.setProperty('--gradient-team',
            'linear-gradient(135deg, ' + team.primary + ', ' + team.secondary + ')');
        s.setProperty('--gradient-team-horizontal',
            'linear-gradient(90deg, ' + team.primary + ', ' + team.secondary + ')');

        // 6. data-team 속성 (CSS 타게팅용)
        document.documentElement.setAttribute('data-team', teamId);

        // 7. shadow/glow (secondary도 glow에 포함)
        s.setProperty('--shadow-md', '0 4px 12px rgba(' + team.primaryRgb + ', 0.2)');
        s.setProperty('--shadow-lg', '0 4px 15px rgba(' + team.primaryRgb + ', 0.4)');
        s.setProperty('--shadow-xl', '0 10px 30px rgba(' + team.primaryRgb + ', 0.4)');
        s.setProperty('--shadow-2xl', '0 15px 40px rgba(' + team.primaryRgb + ', 0.3)');
        s.setProperty('--glow-accent',
            '0 0 20px rgba(' + team.secondaryRgb + ', 0.35), 0 0 40px rgba(' + team.primaryRgb + ', 0.15)');
        s.setProperty('--glow-brand', '0 0 20px rgba(' + team.primaryRgb + ', 0.3)');

        // 8. Cadillac 배경 특수 처리
        if (teamId === 'cadillac') {
            s.setProperty('--bg-body', '#111');
            s.setProperty('--bg-deep', '#111');
            s.setProperty('--bg-base', '#111');
        } else {
            s.setProperty('--bg-body', '#1a1a1a');
            s.setProperty('--bg-deep', '#1a1a1a');
            s.setProperty('--bg-base', '#1a1a1a');
        }

        // 9. localStorage 캐시
        localStorage.setItem('selectedTeam', teamId);

        // 10. 팀 변경 이벤트 발행
        document.dispatchEvent(new CustomEvent('teamChanged', { detail: { teamId: teamId } }));
    }

    // 테마 리셋 (CSS 변수를 :root 기본값으로 복원)
    function resetTeamTheme() {
        var s = document.documentElement.style;
        var props = [
            '--color-brand', '--color-brand-dark', '--color-brand-darker', '--color-brand-darkest',
            '--color-brand-light', '--color-brand-lighter',
            '--color-brand-rgb', '--color-brand-dark-rgb', '--color-brand-light-rgb',
            '--color-lime', '--color-lime-rgb',
            '--color-secondary', '--color-secondary-rgb',
            '--text-on-brand',
            '--gradient-team', '--gradient-team-horizontal',
            '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-2xl',
            '--glow-accent', '--glow-brand',
            '--bg-body', '--bg-deep', '--bg-base'
        ];
        for (var i = 0; i < props.length; i++) {
            s.removeProperty(props[i]);
        }
        document.documentElement.removeAttribute('data-team');
        localStorage.removeItem('selectedTeam');
    }

    // 트랜지션 포함 테마 적용
    function applyTeamThemeWithTransition(teamId) {
        if (document.readyState !== 'complete') {
            applyTeamTheme(teamId);
            return;
        }
        document.body.style.transition = 'opacity 0.25s ease';
        document.body.style.opacity = '0';
        setTimeout(function() {
            applyTeamTheme(teamId);
            document.body.style.opacity = '1';
            setTimeout(function() { document.body.style.transition = ''; }, 250);
        }, 250);
    }

    // 팀 선택 모달
    function showTeamSelectModal(options) {
        options = options || {};
        var closable = options.closable || false;
        var currentTeam = options.currentTeam || null;
        var onSelect = options.onSelect || null;

        // 기존 모달 제거
        var existing = document.getElementById('teamSelectOverlay');
        if (existing) existing.remove();

        var selectedTeam = currentTeam;

        // 오버레이
        var overlay = document.createElement('div');
        overlay.id = 'teamSelectOverlay';
        overlay.className = 'team-select-overlay';
        if (closable) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) overlay.remove();
            });
        }

        // 모달
        var modal = document.createElement('div');
        modal.className = 'team-select-modal';

        // 헤더
        var header = document.createElement('div');
        header.className = 'team-select-header';
        var title = document.createElement('h2');
        title.className = 'team-select-title';
        title.textContent = closable ? '팀 변경' : '응원할 팀을 선택하세요';
        header.appendChild(title);
        if (closable) {
            var closeBtn = document.createElement('button');
            closeBtn.className = 'team-select-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', function() { overlay.remove(); });
            header.appendChild(closeBtn);
        }
        modal.appendChild(header);

        // 그리드
        var grid = document.createElement('div');
        grid.className = 'team-select-grid';

        var teamIds = Object.keys(F1_TEAMS);
        teamIds.forEach(function(tid) {
            var team = F1_TEAMS[tid];
            var card = document.createElement('button');
            card.className = 'team-select-card';
            card.setAttribute('data-team', tid);
            if (tid === currentTeam) card.classList.add('selected');

            // 드라이버 얼굴 이미지
            var driversWrap = document.createElement('div');
            driversWrap.className = 'team-select-drivers';

            team.drivers.forEach(function(driver) {
                var img = document.createElement('img');
                img.className = 'team-select-driver-img';
                img.src = getTeamDriverImageUrl(driver.code, team.imageSlug);
                img.alt = driver.name;
                img.loading = 'lazy';
                img.onerror = function() { this.style.display = 'none'; };
                driversWrap.appendChild(img);
            });

            var name = document.createElement('span');
            name.className = 'team-select-name';
            name.textContent = team.name;

            card.appendChild(driversWrap);
            card.appendChild(name);

            // 팀 그래디언트 배경 적용
            card.style.background = 'linear-gradient(135deg, rgba(' +
                team.primaryRgb + ', 0.12), rgba(' + team.secondaryRgb + ', 0.06))';
            card.style.borderColor = team.primary;

            card.addEventListener('click', function() {
                // 이전 선택 해제 + 스타일 복원
                grid.querySelectorAll('.team-select-card.selected').forEach(function(el) {
                    el.classList.remove('selected');
                    var t = F1_TEAMS[el.getAttribute('data-team')];
                    if (t) {
                        el.style.background = 'linear-gradient(135deg, rgba(' +
                            t.primaryRgb + ', 0.12), rgba(' + t.secondaryRgb + ', 0.06))';
                    }
                });
                card.classList.add('selected');
                card.style.background = 'linear-gradient(135deg, rgba(' +
                    team.primaryRgb + ', 0.25), rgba(' + team.secondaryRgb + ', 0.12))';
                selectedTeam = tid;
                confirmBtn.disabled = false;
                // 미리보기
                applyTeamTheme(tid);
            });

            grid.appendChild(card);
        });
        modal.appendChild(grid);

        // 확인 버튼
        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'team-select-confirm';
        confirmBtn.textContent = closable ? '변경하기' : '시작하기';
        confirmBtn.disabled = !selectedTeam;
        confirmBtn.addEventListener('click', function() {
            if (!selectedTeam) return;
            if (onSelect) {
                var result = onSelect(selectedTeam);
                if (result && typeof result.then === 'function') {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = '저장 중...';
                    result.then(function() {
                        overlay.remove();
                    }).catch(function(err) {
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = closable ? '변경하기' : '시작하기';
                        if (typeof showToast === 'function') {
                            if (err && err.code === 'permission-denied' && closable) {
                                showToast('팀 변경은 7일에 1번만 가능합니다.', 'error');
                            } else if (err && err.code === 'permission-denied') {
                                showToast('팀 선택에 실패했습니다. 다시 시도해주세요.', 'error');
                            } else {
                                showToast('팀 변경에 실패했습니다.', 'error');
                            }
                        }
                        console.error('팀 선택/변경 실패:', err);
                    });
                    return;
                }
            }
            overlay.remove();
        });
        modal.appendChild(confirmBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // ESC 키 처리
        if (closable) {
            var escHandler = function(e) {
                if (e.key === 'Escape') {
                    overlay.remove();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        }
    }

    // TeamsModule
    var TeamsModule = {
        isValidTeam: function(teamId) {
            return teamId in F1_TEAMS;
        },
        getTeamData: function(teamId) {
            return F1_TEAMS[teamId] || null;
        },
        getAllTeams: function() {
            return Object.assign({}, F1_TEAMS);
        },
        getValidTeamIds: function() {
            return Object.keys(F1_TEAMS);
        }
    };

    // 전역 노출
    Object.freeze(TeamsModule);
    window.F1_TEAMS = F1_TEAMS;
    window.TeamsModule = TeamsModule;
    window.applyTeamTheme = applyTeamTheme;
    window.applyTeamThemeWithTransition = applyTeamThemeWithTransition;
    window.resetTeamTheme = resetTeamTheme;
    window.showTeamSelectModal = showTeamSelectModal;

    // FOUC 방지: localStorage에서 즉시 테마 적용
    var savedTeam = localStorage.getItem('selectedTeam');
    if (savedTeam && F1_TEAMS[savedTeam]) {
        applyTeamTheme(savedTeam);
    } else {
        // 비로그인 유저: 팀 미선택 시 DOMContentLoaded 후 모달 표시
        document.addEventListener('DOMContentLoaded', function() {
            // auth.js가 로그인 유저에게 모달을 표시하므로, 여기서는 비로그인만 처리
            // auth 리스너가 실행될 시간을 주기 위해 약간 지연
            setTimeout(function() {
                // 이미 팀이 선택되었거나 모달이 열려있으면 스킵
                if (localStorage.getItem('selectedTeam')) return;
                if (document.getElementById('teamSelectOverlay')) return;

                showTeamSelectModal({
                    closable: false,
                    onSelect: function(teamId) {
                        applyTeamTheme(teamId);
                    }
                });
            }, 1500);
        });
    }

})();
