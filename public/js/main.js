/* ============================================
   KENZIA ESTATES - MAIN JAVASCRIPT
   ============================================ */

// DOM Elements
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
const scrollTopBtn = document.getElementById('scrollTop');
const heroSlider = document.getElementById('heroSlider');
const dots = document.querySelectorAll('.dot');
const testimonialsSlider = document.getElementById('testimonialsSlider');
const tDots = document.querySelectorAll('.t-dot');
const propertiesGrid = document.getElementById('propertiesGrid');
const filterBtns = document.querySelectorAll('.filter-btn');

// ============================================
// NAVBAR SCROLL EFFECT
// ============================================
window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        navbar.classList.add('scrolled');
        scrollTopBtn.classList.add('visible');
    } else {
        navbar.classList.remove('scrolled');
        scrollTopBtn.classList.remove('visible');
    }
});

// ============================================
// MOBILE MENU TOGGLE
// ============================================
hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// ============================================
// SCROLL TO TOP
// ============================================
scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ============================================
// HERO SLIDER
// ============================================
let currentSlide = 0;
const slides = document.querySelectorAll('.hero-slide');
const totalSlides = slides.length;

function showSlide(index) {
    slides.forEach((slide, i) => {
        slide.classList.remove('active');
        dots[i].classList.remove('active');
        if (i === index) {
            slide.classList.add('active');
            dots[i].classList.add('active');
        }
    });
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    showSlide(currentSlide);
}

// Auto-advance slider
setInterval(nextSlide, 5000);

// Manual slide navigation
dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
        currentSlide = index;
        showSlide(currentSlide);
    });
});

// ============================================
// TESTIMONIALS SLIDER
// ============================================
let currentTestimonial = 0;
const testimonialCards = document.querySelectorAll('.testimonial-card');
const totalTestimonials = testimonialCards.length;

function showTestimonial(index) {
    testimonialCards.forEach((card, i) => {
        card.classList.remove('active');
        tDots[i].classList.remove('active');
        if (i === index) {
            card.classList.add('active');
            tDots[i].classList.add('active');
        }
    });
}

function nextTestimonial() {
    currentTestimonial = (currentTestimonial + 1) % totalTestimonials;
    showTestimonial(currentTestimonial);
}

// Auto-advance testimonials
setInterval(nextTestimonial, 6000);

// Manual testimonial navigation
tDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
        currentTestimonial = index;
        showTestimonial(currentTestimonial);
    });
});

// ============================================
// SAMPLE PROPERTIES DATA
// ============================================
const properties = [
    {
        id: 1,
        title: "Luxury Villa with Pool",
        location: "Palmeraie, Marrakech",
        price: "4,500,000 MAD",
        type: "sale",
        category: "luxury",
        image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=600",
        bedrooms: 5,
        bathrooms: 4,
        surface: "450 m²"
    },
    {
        id: 2,
        title: "Modern Apartment Sea View",
        location: "Ain Diab, Casablanca",
        price: "2,800,000 MAD",
        type: "sale",
        category: "new",
        image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600",
        bedrooms: 3,
        bathrooms: 2,
        surface: "145 m²"
    },
    {
        id: 3,
        title: "Traditional Riad Renovated",
        location: "Medina, Fès",
        price: "15,000 MAD/mo",
        type: "rent",
        category: "all",
        image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600",
        bedrooms: 4,
        bathrooms: 3,
        surface: "280 m²"
    },
    {
        id: 4,
        title: "Penthouse with Terrace",
        location: "Agdal, Rabat",
        price: "3,200,000 MAD",
        type: "sale",
        category: "luxury",
        image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600",
        bedrooms: 3,
        bathrooms: 3,
        surface: "210 m²"
    },
    {
        id: 5,
        title: "Beachfront Villa",
        location: "Taghazout, Agadir",
        price: "20,000 MAD/mo",
        type: "rent",
        category: "luxury",
        image: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=600",
        bedrooms: 4,
        bathrooms: 3,
        surface: "320 m²"
    },
    {
        id: 6,
        title: "Contemporary Apartment",
        location: "Gueliz, Marrakech",
        price: "1,850,000 MAD",
        type: "sale",
        category: "new",
        image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600",
        bedrooms: 2,
        bathrooms: 2,
        surface: "95 m²"
    }
];

// ============================================
// RENDER PROPERTIES
// ============================================
function renderProperties(filter = 'all') {
    if (!propertiesGrid) return;
    
    propertiesGrid.innerHTML = '';
    
    const filteredProperties = filter === 'all' 
        ? properties 
        : properties.filter(p => p.type === filter || p.category === filter);
    
    filteredProperties.forEach(property => {
        const propertyCard = document.createElement('div');
        propertyCard.className = 'property-card';
        propertyCard.innerHTML = `
            <div class="property-image">
                <img src="${property.image}" alt="${property.title}">
                <span class="property-badge">${property.type === 'sale' ? 'FOR SALE' : 'FOR RENT'}</span>
                <span class="property-price">${property.price}</span>
            </div>
            <div class="property-content">
                <div class="property-location">
                    <i class="fas fa-location-dot"></i>
                    ${property.location}
                </div>
                <h3 class="property-title">${property.title}</h3>
                <div class="property-features">
                    <div class="property-feature">
                        <i class="fas fa-bed"></i>
                        ${property.bedrooms} Beds
                    </div>
                    <div class="property-feature">
                        <i class="fas fa-bath"></i>
                        ${property.bathrooms} Baths
                    </div>
                    <div class="property-feature">
                        <i class="fas fa-ruler-combined"></i>
                        ${property.surface}
                    </div>
                </div>
                <a href="property-detail.html?id=${property.id}" class="property-link">
                    View Details <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        `;
        propertiesGrid.appendChild(propertyCard);
    });
}

// Initial render
renderProperties();

// ============================================
// PROPERTY FILTERS
// ============================================
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.getAttribute('data-filter');
        renderProperties(filter);
    });
});

// ============================================
// ESTIMATION FORM STEPS
// ============================================
let currentStep = 1;

function nextStep(step) {
    // Validate current step
    const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
    const requiredFields = currentStepEl.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = '#e74c3c';
        } else {
            field.style.borderColor = '#ddd';
        }
    });
    
    if (!isValid) {
        alert('Please fill in all required fields');
        return;
    }
    
    document.querySelector(`.form-step[data-step="${currentStep}"]`).style.display = 'none';
    document.querySelector(`.form-step[data-step="${step}"]`).style.display = 'block';
    currentStep = step;
}

function previousStep(step) {
    document.querySelector(`.form-step[data-step="${currentStep}"]`).style.display = 'none';
    document.querySelector(`.form-step[data-step="${step}"]`).style.display = 'block';
    currentStep = step;
}

// ============================================
// ESTIMATION FORM SUBMISSION
// ============================================
const estimationForm = document.getElementById('estimationForm');
const estimationResult = document.getElementById('estimationResult');

if (estimationForm) {
    estimationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Simulate API call
        setTimeout(() => {
            document.querySelector('.estimation-form').style.display = 'none';
            estimationResult.style.display = 'block';
            
            // Generate random estimation
            const randomPrice = Math.floor(Math.random() * (5000000 - 1000000) + 1000000);
            document.getElementById('estimatedPrice').textContent = 
                randomPrice.toLocaleString() + ' MAD';
        }, 1500);
    });
}

function resetEstimation() {
    estimationResult.style.display = 'none';
    document.querySelector('.estimation-form').style.display = 'block';
    estimationForm.reset();
    nextStep(1);
}

function openEstimationModal() {
    // Scroll to estimation section
    const estimationSection = document.querySelector('.estimation-section');
    if (estimationSection) {
        estimationSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// ============================================
// SEARCH FORM
// ============================================
const searchForm = document.getElementById('searchForm');

if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const city = document.getElementById('citySelect').value;
        const type = document.getElementById('propertyType').value;
        const budget = document.getElementById('budget').value;
        
        // Redirect to properties page with filters
        let url = 'properties.html?';
        if (city) url += `city=${city}&`;
        if (type) url += `type=${type}&`;
        if (budget) url += `budget=${budget}`;
        
        window.location.href = url;
    });
}

// ============================================
// SMOOTH SCROLL FOR ANCHOR LINKS
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href.length > 1) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// ============================================
// LAZY LOADING IMAGES
// ============================================
const lazyImages = document.querySelectorAll('img[data-src]');

const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            observer.unobserve(img);
        }
    });
});

lazyImages.forEach(img => imageObserver.observe(img));

// ============================================
// FORM VALIDATION UTILITIES
// ============================================
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^(\+212|0)[5-7]\d{8}$/;
    return re.test(phone.replace(/\s/g, ''));
}

// ============================================
// ANALYTICS & TRACKING
// ============================================
// Track page views
console.log('Kenzia Estates - Page Loaded');

// Track property views
document.querySelectorAll('.property-card').forEach(card => {
    card.addEventListener('click', () => {
        console.log('Property viewed:', card.querySelector('.property-title').textContent);
    });
});

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Kenzia Estates initialized');
    
    // Add loaded class to body for CSS animations
    document.body.classList.add('loaded');
});

// ============================================
// ERROR HANDLING
// ============================================
window.addEventListener('error', (e) => {
    console.error('Error:', e.error);
});

// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================
// Debounce function for scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Optimize scroll listener
window.addEventListener('scroll', debounce(() => {
    // Scroll-related operations
}, 10));
/* ============================================
   CONTACT FORM HANDLING
   ============================================ */
const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');

if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault(); // Empêche le rechargement de la page
        
        // Simulation d'envoi (à remplacer par votre vrai backend/API plus tard)
        const submitBtn = this.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        submitBtn.disabled = true;
        
        setTimeout(() => {
            // Afficher le message de succès
            formSuccess.style.display = 'block';
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            
            // Réinitialiser le formulaire
            contactForm.reset();
            
            // Cacher le message après 5 secondes
            setTimeout(() => {
                formSuccess.style.display = 'none';
            }, 5000);
        }, 1500);
    });
}