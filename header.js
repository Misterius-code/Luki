// Common Header Component Loader and Initializer
(function() {
    'use strict';

    // Load header HTML and CSS
    async function loadHeader() {
        const headerContainer = document.getElementById('header-container');
        if (!headerContainer) {
            console.warn('Header container not found');
            return;
        }

        try {
            // Load CSS
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = '/header.css';
            if (!document.querySelector('link[href="/header.css"]')) {
                document.head.appendChild(cssLink);
            }

            // Load HTML
            const response = await fetch('/header.html');
            if (!response.ok) throw new Error('Failed to load header');
            const html = await response.text();
            headerContainer.innerHTML = html;

            // Initialize header functionality
            initializeHeader();
        } catch (error) {
            console.error('Error loading header:', error);
            headerContainer.innerHTML = '<div style="padding: 20px; color: red;">Błąd ładowania nagłówka</div>';
        }
    }

    // Initialize header functionality
    function initializeHeader() {
        // Set page title and breadcrumbs from data attributes
        const pageTitle = document.getElementById('page-title');
        const pageCrumbs = document.getElementById('page-crumbs');
        const headerContainer = document.getElementById('header-container');
        
        if (headerContainer && headerContainer.dataset.title && pageTitle) {
            pageTitle.textContent = headerContainer.dataset.title;
        }
        
        // Set breadcrumbs - use custom data-crumbs if provided, otherwise generate automatically
        if (pageCrumbs) {
            // Check if custom breadcrumbs are provided
            if (headerContainer && headerContainer.dataset.crumbs) {
                pageCrumbs.innerHTML = headerContainer.dataset.crumbs;
            } else {
                // Always show the same breadcrumbs: Zamówienia / Plan Produkcji / Archiwum
                // Detect current page from URL
                const currentPath = window.location.pathname;
                let activePage = '';
                
                // Check pathname to determine current page
                if (currentPath === '/' || currentPath === '/zamowienia' || currentPath.startsWith('/zamowienia')) {
                    activePage = 'zamowienia';
                } else if (currentPath === '/plan' || currentPath.startsWith('/plan')) {
                    activePage = 'plan';
                } else if (currentPath === '/archiwum' || currentPath.startsWith('/archiwum')) {
                    activePage = 'archiwum';
                }
                
                // Build breadcrumbs with active page highlighted
                const crumbs = [
                    { text: 'Zamówienia', href: '/', id: 'zamowienia' },
                    { text: 'Plan Produkcji', href: '/plan', id: 'plan' },
                    { text: 'Archiwum', href: '/archiwum', id: 'archiwum' }
                ];
                
                pageCrumbs.innerHTML = crumbs.map((crumb, index) => {
                    const isActive = crumb.id === activePage;
                    const separator = index > 0 ? ' / ' : '';
                    if (isActive) {
                        return separator + `<span class="crumb-active">${crumb.text}</span>`;
                    } else {
                        return separator + `<a href="${crumb.href}" title="${crumb.text}">${crumb.text}</a>`;
                    }
                }).join('');
            }
        }

        // Date updater
        const dateEl = document.getElementById('date-now');
        if (dateEl) {
            function updateNowDate() {
                try {
                    dateEl.textContent = new Date().toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
                } catch {
                    dateEl.textContent = new Date().toLocaleString('pl-PL');
                }
            }
            updateNowDate();
            setInterval(updateNowDate, 60000);
        }

        // Theme initialization
        const toggle = document.getElementById('light-toggle');
        if (toggle) {
            // Initialize theme from localStorage
            try {
                const saved = localStorage.getItem('theme');
                if (saved === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                    toggle.checked = true;
                } else {
                    // Default to dark theme (no data-theme attribute)
                    document.documentElement.removeAttribute('data-theme');
                    toggle.checked = false;
                }
            } catch (e) {
                console.error('Error loading theme:', e);
            }

            // Theme toggle handler
            const handleThemeChange = (e) => {
                if (e) e.stopPropagation(); // Prevent dropdown from closing
                const isLight = toggle.checked;
                if (isLight) {
                    document.documentElement.setAttribute('data-theme', 'light');
                    try { localStorage.setItem('theme', 'light'); } catch {}
                } else {
                    document.documentElement.removeAttribute('data-theme');
                    try { localStorage.removeItem('theme'); } catch {}
                }
            };
            
            toggle.addEventListener('change', handleThemeChange);
            toggle.addEventListener('click', handleThemeChange);
            
            // Also handle click on the switch container and slider to toggle
            const switchContainer = toggle.closest('.switch');
            if (switchContainer) {
                switchContainer.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggle.checked = !toggle.checked;
                    handleThemeChange(e);
                });
            }
            
            const slider = toggle.nextElementSibling;
            if (slider && slider.classList.contains('slider')) {
                slider.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggle.checked = !toggle.checked;
                    handleThemeChange(e);
                });
            }
        }

        // Profile dropdown
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        
        if (profileBtn && profileDropdown) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('show');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                    profileDropdown.classList.remove('show');
                }
            });
            
            // Prevent dropdown from closing when clicking on theme toggle
            const themeToggleItem = profileDropdown.querySelector('.theme-toggle');
            if (themeToggleItem) {
                themeToggleItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        }

        // Logout handler
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await fetch('/api/logout', { method: 'POST' });
                    window.location.href = '/login';
                } catch (e) {
                    console.error('Logout error:', e);
                    window.location.href = '/login';
                }
            });
        }

        // Allow pages to add extra buttons
        const extraButtonsContainer = document.getElementById('header-extra-buttons');
        if (extraButtonsContainer && headerContainer && headerContainer.dataset.extraButtons) {
            try {
                extraButtonsContainer.innerHTML = headerContainer.dataset.extraButtons;
            } catch (e) {
                console.error('Error parsing extra buttons:', e);
            }
        }
    }

    // Auto-load when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadHeader);
    } else {
        loadHeader();
    }
})();

