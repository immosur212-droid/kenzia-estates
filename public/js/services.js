/* ============================================
   KENZIA ESTATES - SERVICES PAGE
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    setupProcessTabs();
    setupFAQ();
});

// ============================================
// PROCESS TABS
// ============================================
function setupProcessTabs() {
    const tabs = document.querySelectorAll('.process-tab');
    const contents = document.querySelectorAll('.process-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const process = tab.getAttribute('data-process');

            // Désactiver tous les tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Afficher le contenu correspondant
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `process-${process}`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// ============================================
// FAQ ACCORDION
// ============================================
function setupFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Fermer tous les autres
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            // Ouvrir celui-ci si il n'était pas actif
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}