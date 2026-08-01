/* ============================================
   KENZIA ESTATES - PROPERTIES PAGE
   Version connectée à l'API PostgreSQL
   ============================================ */

// ============================================
// CONFIGURATION API
// ============================================

// ============================================
// VARIABLES GLOBALES
// ============================================
let allProperties = [];
let currentProperties = [];
let displayedCount = 6;
let map = null;
let markers = [];

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadPropertiesFromAPI();
    setupFilterTabs();
    setupSortSelect();
});

// ============================================
// CHARGER LES PROPRIÉTÉS DEPUIS L'API
// ============================================
async function loadPropertiesFromAPI() {
    try {
        const response = await fetch(`${API_URL}/properties`);
        
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des propriétés');
        }
        
        const properties = await response.json();
        
        // Mapper les données de la BDD vers le format frontend
        allProperties = properties.map(p => ({
            id: p.id,
            title: p.title,
            city: p.city,
            neighborhood: p.neighborhood || '',
            type: p.type,
            transaction: p.transaction,
            price: p.price,
            priceLabel: p.price_label || formatPrice(p.price),
            bedrooms: p.bedrooms,
            bathrooms: p.bathrooms,
            surface: p.surface,
            image: p.image_url || 'https://via.placeholder.com/600x400?text=No+Image',
            tags: p.is_luxury ? ['luxury'] : [],
            lat: parseFloat(p.lat) || null,
            lng: parseFloat(p.lng) || null,
            isNew: p.is_new || false,
            description: p.description || ''
        }));
        
        currentProperties = [...allProperties];
        renderProperties();
        
    } catch (error) {
        console.error('Erreur chargement propriétés:', error);
        displayError('Impossible de charger les propriétés. Veuillez réessayer plus tard.');
    }
}

// ============================================
// FONCTION UTILITAIRE : Formater le prix
// ============================================
function formatPrice(price) {
    if (price >= 1000000) {
        return price.toLocaleString('en-US') + ' MAD';
    } else {
        return price.toLocaleString('en-US') + ' MAD/mo';
    }
}

// ============================================
// AFFICHER UNE ERREUR
// ============================================
function displayError(message) {
    const grid = document.getElementById('propertiesGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Properties</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="loadPropertiesFromAPI()" style="margin-top: 20px;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

// ============================================
// RENDU DES PROPRIÉTÉS
// ============================================
function renderProperties() {
    // Dans la fonction renderProperties(), remplacez le début par :

card.innerHTML = `
    <a href="property-detail.html?id=${property.id}" style="text-decoration: none; color: inherit;">
        <div class="property-image">
            <img src="${property.image}" alt="${property.title}" loading="lazy">
            <div class="property-badges">${badgesHTML}</div>
            <button class="property-favorite" onclick="toggleFavorite(this, event)">
                <i class="far fa-heart"></i>
            </button>
            <div class="property-price-tag">
                ${property.priceLabel}
            </div>
        </div>
        <div class="property-content">
            <div class="property-location">
                <i class="fas fa-location-dot"></i>
                ${property.neighborhood}, ${property.city.charAt(0).toUpperCase() + property.city.slice(1)}
            </div>
            <h3 class="property-title">${property.title}</h3>
            <div class="property-features">
                <div class="property-feature">
                    <i class="fas fa-bed"></i> ${property.bedrooms} Beds
                </div>
                <div class="property-feature">
                    <i class="fas fa-bath"></i> ${property.bathrooms} Baths
                </div>
                <div class="property-feature">
                    <i class="fas fa-ruler-combined"></i> ${property.surface} m²
                </div>
            </div>
        </div>
    </a>
`;
    const grid = document.getElementById('propertiesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const toShow = currentProperties.slice(0, displayedCount);

    if (toShow.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No properties found</h3>
                <p>Try adjusting your filters to see more results.</p>
            </div>
        `;
        document.getElementById('resultsCount').textContent = '0';
        document.getElementById('loadMoreWrapper').style.display = 'none';
        return;
    }

    document.getElementById('resultsCount').textContent = currentProperties.length;

    toShow.forEach(property => {
        const card = document.createElement('div');
        card.className = 'property-card';
        card.setAttribute('data-transaction', property.transaction);
        card.setAttribute('data-city', property.city);
        card.setAttribute('data-type', property.type);

        let badgesHTML = '';
        if (property.transaction === 'sale') {
            badgesHTML += '<span class="property-badge">FOR SALE</span>';
        } else {
            badgesHTML += '<span class="property-badge">FOR RENT</span>';
        }
        if (property.tags.includes('luxury')) {
            badgesHTML += '<span class="property-badge luxury">LUXURY</span>';
        }
        if (property.isNew) {
            badgesHTML += '<span class="property-badge new">NEW</span>';
        }

        card.innerHTML = `
            <div class="property-image">
                <img src="${property.image}" alt="${property.title}" loading="lazy">
                <div class="property-badges">${badgesHTML}</div>
                <button class="property-favorite" onclick="toggleFavorite(this, event)">
                    <i class="far fa-heart"></i>
                </button>
                <div class="property-price-tag">
                    ${property.priceLabel}
                </div>
            </div>
            <div class="property-content">
                <div class="property-location">
                    <i class="fas fa-location-dot"></i>
                    ${property.neighborhood}, ${property.city.charAt(0).toUpperCase() + property.city.slice(1)}
                </div>
                <h3 class="property-title">${property.title}</h3>
                <div class="property-features">
                    <div class="property-feature">
                        <i class="fas fa-bed"></i> ${property.bedrooms} Beds
                    </div>
                    <div class="property-feature">
                        <i class="fas fa-bath"></i> ${property.bathrooms} Baths
                    </div>
                    <div class="property-feature">
                        <i class="fas fa-ruler-combined"></i> ${property.surface} m²
                    </div>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    // Show/hide Load More
    const loadMoreWrapper = document.getElementById('loadMoreWrapper');
    if (displayedCount >= currentProperties.length) {
        loadMoreWrapper.style.display = 'none';
    } else {
        loadMoreWrapper.style.display = 'block';
    }
}

// ============================================
// LOAD MORE
// ============================================
function loadMore() {
    displayedCount += 6;
    renderProperties();
}

// ============================================
// FILTRES
// ============================================
function setupFilterTabs() {
    // Transaction tabs
    document.querySelectorAll('[data-transaction]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-transaction]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    // Bedrooms tabs
    document.querySelectorAll('[data-beds]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-beds]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
}

function applyFilters() {
    const transaction = document.querySelector('[data-transaction].active')?.getAttribute('data-transaction') || 'all';
    const city = document.getElementById('filterCity').value;
    const type = document.getElementById('filterType').value;
    const minPrice = parseInt(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseInt(document.getElementById('maxPrice').value) || Infinity;
    const beds = document.querySelector('[data-beds].active')?.getAttribute('data-beds') || 'any';
    const minSurface = parseInt(document.getElementById('minSurface').value) || 0;
    const maxSurface = parseInt(document.getElementById('maxSurface').value) || Infinity;

    currentProperties = allProperties.filter(p => {
        if (transaction !== 'all' && p.transaction !== transaction) return false;
        if (city && p.city !== city) return false;
        if (type && p.type !== type) return false;
        if (p.price < minPrice || p.price > maxPrice) return false;
        if (beds !== 'any' && p.bedrooms < parseInt(beds)) return false;
        if (p.surface < minSurface || p.surface > maxSurface) return false;
        return true;
    });

    displayedCount = 6;
    renderProperties();

    // Fermer sidebar sur mobile
    if (window.innerWidth <= 992) {
        closeFilters();
    }
}

function resetFilters() {
    document.getElementById('filterCity').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.getElementById('minSurface').value = '';
    document.getElementById('maxSurface').value = '';

    document.querySelectorAll('[data-transaction]').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-transaction="all"]').classList.add('active');

    document.querySelectorAll('[data-beds]').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-beds="any"]').classList.add('active');

    currentProperties = [...allProperties];
    displayedCount = 6;
    renderProperties();
}

// ============================================
// VUE GRILLE / CARTE
// ============================================
function setView(view) {
    const gridBtn = document.getElementById('gridViewBtn');
    const mapBtn = document.getElementById('mapViewBtn');
    const grid = document.getElementById('propertiesGrid');
    const mapContainer = document.getElementById('mapContainer');
    const loadMore = document.getElementById('loadMoreWrapper');

    if (view === 'map') {
        gridBtn.classList.remove('active');
        mapBtn.classList.add('active');
        grid.style.display = 'none';
        loadMore.style.display = 'none';
        mapContainer.style.display = 'block';
        initMap();
    } else {
        mapBtn.classList.remove('active');
        gridBtn.classList.add('active');
        grid.style.display = 'grid';
        mapContainer.style.display = 'none';
        if (displayedCount < currentProperties.length) {
            loadMore.style.display = 'block';
        }
    }
}

// ============================================
// CARTE INTERACTIVE (Leaflet)
// ============================================
function initMap() {
    if (map) {
        map.invalidateSize();
        updateMapMarkers();
        return;
    }

    map = L.map('propertiesMap').setView([32.0, -6.5], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    updateMapMarkers();
}

function updateMapMarkers() {
    if (!map) return;

    // Supprimer les anciens marqueurs
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Icône personnalisée
    const icon = L.divIcon({
        html: '<div style="background:#B89970;color:#1a1a2e;padding:6px 12px;font-weight:700;font-size:12px;font-family:Montserrat,sans-serif;white-space:nowrap;border-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">●</div>',
        className: '',
        iconSize: [20, 20]
    });

    currentProperties.forEach(p => {
        if (p.lat && p.lng) {
            const marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);

            marker.bindPopup(`
                <div style="font-family:Montserrat,sans-serif;min-width:200px;">
                    <img src="${p.image}" style="width:100%;height:120px;object-fit:cover;margin-bottom:10px;" alt="${p.title}">
                    <h4 style="font-size:14px;margin-bottom:5px;">${p.title}</h4>
                    <p style="color:#666;font-size:12px;margin-bottom:5px;">${p.neighborhood}, ${p.city}</p>
                    <p style="color:#B89970;font-weight:700;font-size:16px;">${p.priceLabel}</p>
                </div>
            `);

            markers.push(marker);
        }
    });
}

// ============================================
// FAVORIS
// ============================================
function toggleFavorite(btn, event) {
    event.stopPropagation();
    btn.classList.toggle('active');
    const icon = btn.querySelector('i');
    if (btn.classList.contains('active')) {
        icon.className = 'fas fa-heart';
    } else {
        icon.className = 'far fa-heart';
    }
}

// ============================================
// FILTRES MOBILE
// ============================================
function toggleFilters() {
    const sidebar = document.getElementById('filtersSidebar');
    sidebar.classList.toggle('open');

    // Créer un overlay
    let overlay = document.querySelector('.filters-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'filters-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', closeFilters);
    }
    overlay.classList.toggle('active');
}

function closeFilters() {
    document.getElementById('filtersSidebar').classList.remove('open');
    const overlay = document.querySelector('.filters-overlay');
    if (overlay) overlay.classList.remove('active');
}

// ============================================
// TRI
// ============================================
function setupSortSelect() {
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            
            switch (value) {
                case 'price-asc':
                    currentProperties.sort((a, b) => a.price - b.price);
                    break;
                case 'price-desc':
                    currentProperties.sort((a, b) => b.price - a.price);
                    break;
                case 'surface':
                    currentProperties.sort((a, b) => b.surface - a.surface);
                    break;
                case 'newest':
                default:
                    currentProperties.sort((a, b) => b.id - a.id);
                    break;
            }
            
            displayedCount = 6;
            renderProperties();
        });
    }
}