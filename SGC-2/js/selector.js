// Select propio: reemplaza un <select> nativo por un botón con el estilo de .form-select y un menú de ui.js
// (UI.desplegable), con el mismo aspecto que el resto de los desplegables. El nativo sigue en el formulario (oculto):
// su valor y su evento `change` son los de siempre. Se marca en el HTML con `data-select-propio` (antes una lista de
// ids en app.js). Separado de app.js; lo llama su DOMContentLoaded. CSS: formularios.css y desplegables.css.

function crearCustomDropdownSelect(selectEl) {
    if (!selectEl || selectEl.dataset.customSelect === 'true') return;
    selectEl.dataset.customSelect = 'true';

    const isWAuto = selectEl.classList.contains('w-auto');

    // Remover atributo required para evitar errores de validación nativa de formulario sobre control oculto
    if (selectEl.hasAttribute('required')) {
        selectEl.removeAttribute('required');
    }

    // Contenedor wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper dropdown position-relative ' + (isWAuto ? 'd-inline-block w-auto' : 'w-100');

    // Botón disparador con estilo form-select
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'form-select form-select-sm custom-select-btn d-flex align-items-center justify-content-between text-start ' + (isWAuto ? 'w-auto' : 'w-100');
    triggerBtn.setAttribute('data-ui-toggle', 'dropdown');
    triggerBtn.setAttribute('data-ui-auto-close', 'true');
    triggerBtn.setAttribute('aria-expanded', 'false');
    triggerBtn.setAttribute('data-ui-offset', '0,6');
    triggerBtn.disabled = selectEl.disabled;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-select-label text-truncate me-2';
    triggerBtn.appendChild(labelSpan);

    // Menú popup desplegable
    const menu = document.createElement('ul');
    menu.className = 'dropdown-menu custom-select-menu';

    // Insertar en el DOM manteniendo el select original en su posición dentro del form
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    wrapper.appendChild(triggerBtn);
    wrapper.appendChild(menu);

    // el nativo queda oculto (lo reemplaza el botón): sin los estilos de .form-select, que no se ven
    selectEl.classList.remove('form-select', 'form-select-sm');
    selectEl.classList.add('custom-select-native');

    function actualizarUI() {
        const selectedOpt = selectEl.selectedOptions[0] || selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        labelSpan.textContent = selectedOpt ? selectedOpt.textContent : '';
        triggerBtn.disabled = selectEl.disabled;

        menu.replaceChildren();
        const opciones = selectEl.options;
        for (let i = 0; i < opciones.length; i++) {
            const opt = opciones[i];
            const li = document.createElement('li');
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'dropdown-item d-flex align-items-center justify-content-between';

            const txtSpan = document.createElement('span');
            txtSpan.className = 'text-truncate';
            txtSpan.textContent = opt.textContent;
            itemBtn.appendChild(txtSpan);

            itemBtn.dataset.value = opt.value;

            if (opt.selected) {
                itemBtn.classList.add('active');
                const check = document.createElement('i');
                check.className = 'bi bi-check2 ms-2 fs-6';
                itemBtn.appendChild(check);
            }

            if (opt.disabled) {
                itemBtn.classList.add('disabled');
                itemBtn.disabled = true;
            } else {
                itemBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (selectEl.value !== opt.value) {
                        selectEl.value = opt.value;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    actualizarUI();
                    UI.desplegable.cerrar(triggerBtn);
                });
            }

            li.appendChild(itemBtn);
            menu.appendChild(li);
        }
    }

    // Actualizar UI al hacer clic en el botón o cambiar el valor
    triggerBtn.addEventListener('click', actualizarUI);

    triggerBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const isMenuOpen = menu.classList.contains('show') || triggerBtn.classList.contains('show');
            if (!isMenuOpen) {
                e.preventDefault();
                triggerBtn.blur();
            }
        }
    });

    selectEl.addEventListener('change', actualizarUI);

    if (selectEl.form) {
        selectEl.form.addEventListener('reset', () => setTimeout(actualizarUI, 0));
    }

    const observer = new MutationObserver(() => {
        actualizarUI();
    });
    observer.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

    const label = document.querySelector(`label[for="${selectEl.id}"]`);
    if (label) {
        label.addEventListener('click', (e) => {
            e.preventDefault();
            triggerBtn.focus();
            UI.desplegable.alternar(triggerBtn);
        });
    }

    actualizarUI();
}

/** Convierte todos los <select data-select-propio> de la página (Auditoría: logs, disponibilidad, grabador, video). */
function initSelectsPropios() {
    document.querySelectorAll('select[data-select-propio]').forEach(crearCustomDropdownSelect);
}
