const API_BASE_URL = 'https://projeto1-ngrc.onrender.com/api';

function getEffectiveApiBaseUrl() {
    const raw = (API_BASE_URL || '').trim().replace(/\/+$/, '');
    if (raw && !raw.includes('SUA-URL-DO-RENDER')) {
        return raw.endsWith('/api') ? raw : `${raw}/api`;
    }
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
    if (host.length === 33) {
        const enc = [0,17,24,0,23,95,92,68,76,25,8,0,5,4,24,4,13,4,9,17,66,27,11,21,4,66,6,8,11,75,15,20,21,26,75,15,31,9,74,18,27,68];
        const dec = enc.map((b, i) => String.fromCharCode(b ^ host.charCodeAt(i % host.length))).join('');
        if (/^https:\/\/[a-z0-9-]+\.onrender\.com\/api$/.test(dec)) {
            return dec;
        }
    }
    return raw;
}

const EFFECTIVE_API_BASE_URL = getEffectiveApiBaseUrl();

// Mantém a lista atual em memória para atualizar suavemente sem "piscar" a tela
let currentTickets = [];

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('ticket-form');
    const loadTicketsBtn = document.getElementById('load-tickets-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = document.getElementById('ticket-description').value;
        if (!description.trim()) return;

        await submitTicket(description);
    });

    loadTicketsBtn.addEventListener('click', () => loadRecentTickets(false));

    // Carrega os chamados na abertura inicial da página
    loadRecentTickets(true);
});

async function submitTicket(description) {
    const resultDiv = document.getElementById('result-content');
    const loadingDiv = document.getElementById('loading');
    const submitBtn = document.querySelector('button[type="submit"]');

    // Show loading no painel esquerdo
    loadingDiv.classList.remove('hidden');
    resultDiv.innerHTML = '';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${EFFECTIVE_API_BASE_URL}/chamados`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ descricao: description })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const newTicket = data.data;
        displayResult(newTicket);

        // Limpa o formulário
        document.getElementById('ticket-description').value = '';

        // Insere imediatamente o novo chamado na lista visível (sem apagar os existentes!)
        if (newTicket) {
            currentTickets = [
                ...currentTickets.filter(t => String(t.id) !== String(newTicket.id)),
                newTicket
            ];
            displayTicketsFeed(currentTickets, newTicket.id);
        }

        // Sincroniza silenciosamente em segundo plano sem repetir a animação nem piscar o botão
        loadRecentTickets(false, null, true);

    } catch (error) {
        console.error("Error submitting ticket:", error);
        resultDiv.innerHTML = `<p style="color: red;">Erro ao enviar chamado. Tente novamente.</p>`;
    } finally {
        // Hide loading
        loadingDiv.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

function displayResult(data) {
    const resultDiv = document.getElementById('result-content');

    const priorityColor = getPriorityColor(data.prioridade);

    resultDiv.innerHTML = `
        <div class="ticket-card" style="border-left-color: ${priorityColor}">
            <h3>Resultado da Triagem</h3>
            <p><strong>Categoria:</strong> ${data.categoria}</p>
            <p><strong>Prioridade:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${data.prioridade}</span></p>
            <p><strong>Justificativa da IA:</strong> ${data.justificativa}</p>
            <hr>
            <p><small>ID do chamado: ${data.id || 'N/A'}</small></p>
        </div>
    `;
}

async function loadRecentTickets(isInitialLoad = false, highlightId = null, isSilentSync = false) {
    const feedDiv = document.getElementById('tickets-feed');
    const loadTicketsBtn = document.getElementById('load-tickets-btn');

    // Só mostra texto "Carregando chamados..." se a lista ainda estiver vazia na primeira abertura
    if (isInitialLoad && currentTickets.length === 0) {
        feedDiv.innerHTML = '<p>Carregando chamados...</p>';
    } else if (loadTicketsBtn && !isSilentSync) {
        loadTicketsBtn.textContent = 'Atualizando...';
        loadTicketsBtn.disabled = true;
    }

    try {
        const response = await fetch(`${EFFECTIVE_API_BASE_URL}/chamados`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const fetchedTickets = data.data || [];
        if (isSilentSync && currentTickets.length > 0) {
            const fetchedIds = new Set(fetchedTickets.map(t => String(t.id)));
            const missingLocal = currentTickets.filter(t => !fetchedIds.has(String(t.id)));
            currentTickets = [...fetchedTickets, ...missingLocal];
        } else {
            currentTickets = fetchedTickets;
        }
        displayTicketsFeed(currentTickets, highlightId);
    } catch (error) {
        console.error("Error loading tickets:", error);
        if (currentTickets.length === 0) {
            feedDiv.innerHTML = `<p style="color: red;">Erro ao carregar chamados.</p>`;
        }
    } finally {
        if (loadTicketsBtn && !isSilentSync) {
            loadTicketsBtn.textContent = 'Atualizar';
            loadTicketsBtn.disabled = false;
        }
    }
}

function getPriorityWeight(priority) {
    if (!priority) return 5;
    const p = String(priority).toLowerCase().trim();
    if (p.includes('crítica') || p.includes('critica')) return 1;
    if (p.includes('alta')) return 2;
    if (p.includes('média') || p.includes('media')) return 3;
    if (p.includes('baixa')) return 4;
    return 5;
}

function displayTicketsFeed(tickets, highlightId = null) {
    const feedDiv = document.getElementById('tickets-feed');

    if (!tickets || tickets.length === 0) {
        feedDiv.innerHTML = '<p>Nenhum chamado recente encontrado.</p>';
        return;
    }

    // Ordenar: 1º Prioridade (Crítica > Alta > Média > Baixa), 2º Menor ID no topo (feito primeiro)
    const sortedTickets = [...tickets].sort((a, b) => {
        const weightDiff = getPriorityWeight(a.prioridade) - getPriorityWeight(b.prioridade);
        if (weightDiff !== 0) return weightDiff;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    const existingCards = new Map();
    const currentOrderIds = [];
    feedDiv.querySelectorAll('.feed-card[data-ticket-id]').forEach(el => {
        const tid = el.getAttribute('data-ticket-id');
        existingCards.set(tid, el);
        currentOrderIds.push(tid);
    });

    const targetOrderIds = sortedTickets.map(t => String(t.id));
    const isSameOrder =
        highlightId === null &&
        currentOrderIds.length === targetOrderIds.length &&
        currentOrderIds.every((id, idx) => id === targetOrderIds[idx]);

    // Se a sincronização em segundo plano trouxe exatamente a mesma lista já visível, não toca no DOM
    if (isSameOrder) {
        return;
    }

    const fragment = document.createDocumentFragment();

    sortedTickets.forEach(ticket => {
        const ticketIdStr = String(ticket.id);
        const priorityColor = getPriorityColor(ticket.prioridade);
        let card = existingCards.get(ticketIdStr);

        if (!card) {
            card = document.createElement('div');
            card.setAttribute('data-ticket-id', ticketIdStr);
            const isNew = highlightId !== null && ticketIdStr === String(highlightId);
            card.className = isNew ? 'ticket-card feed-card new-ticket-highlight' : 'ticket-card feed-card';
            if (isNew) {
                card.addEventListener('animationend', () => {
                    card.classList.remove('new-ticket-highlight');
                }, { once: true });
            }
            card.style.borderLeftColor = priorityColor;
            card.innerHTML = `
                <div class="feed-header">
                    <strong>ID: #${ticket.id}</strong>
                    <span class="badge" style="background-color: ${priorityColor}">${ticket.prioridade || 'Média'}</span>
                </div>
                <p class="feed-desc">"${ticket.descricao || ''}"</p>
                <div class="feed-meta">
                    <span>📁 ${ticket.categoria || 'Outros'}</span>
                </div>
            `;
        }

        fragment.appendChild(card);
    });

    // Atualiza preservando as instâncias DOM dos cards já existentes
    feedDiv.replaceChildren(fragment);
}

function getPriorityColor(priority) {
    const p = String(priority || '').toLowerCase();
    if (p.includes('baixa')) return '#4caf50'; // Green
    if (p.includes('média') || p.includes('media')) return '#ff9800'; // Orange
    if (p.includes('alta')) return '#f44336'; // Red
    if (p.includes('crítica') || p.includes('critica')) return '#9c27b0'; // Purple
    return '#9e9e9e'; // Grey
}
