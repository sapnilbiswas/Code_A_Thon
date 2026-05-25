document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('main');
    
    // Entrance Animation: deeply cinematic fade and scale in
    if (mainContent) {
        mainContent.classList.add('cinematic-enter');
        setTimeout(() => {
            mainContent.classList.remove('cinematic-enter');
        }, 1200); // Wait for the 1.2s CSS animation
    }

    // Intercept Links for Exit Animation
    const links = document.querySelectorAll('a[href^="/"]');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            
            // Ignore external, logout, login, or anchor links
            if (!href || href.startsWith('http') || href.includes('logout') || href.includes('login') || href === '#') return;
            
            // Ignore if going to the exact same page
            if (href === window.location.pathname) return;

            // Intercept navigation
            e.preventDefault();

            // Cinematic Exit: smoothly fade, blur, and drift away
            if (mainContent) {
                mainContent.classList.remove('cinematic-enter'); // in case they click fast
                mainContent.classList.add('cinematic-exit');
            }

            // Wait for the cinematic CSS animation to complete before navigating
            setTimeout(() => {
                window.location.href = href;
            }, 750); // Matches the 0.8s exit animation roughly
        });
    });
});
