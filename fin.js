document.addEventListener("DOMContentLoaded", () => {

    //=========================
    // ELEMENTS FROM YOUR HTML
    //=========================

    const pages = document.querySelectorAll(".page");
    const navItems = document.querySelectorAll("[data-page]");

    const topbarTitle =
        document.getElementById("topbarTitle");

    const topbarDate =
        document.getElementById("topbarDate");

    const sidebarToggle =
        document.getElementById("sidebarToggle");

    const sidebar =
        document.getElementById("sidebar");

    const modal =
        document.getElementById("txModal");

    const quickAddBtn =
        document.getElementById("quickAddBtn");

    const addTxBtn =
        document.getElementById("addTxBtn");

    const modalClose =
        document.getElementById("txModalClose");

    const modalCancel =
        document.getElementById("txModalCancel");

    const saveBtn =
        document.getElementById("txModalSave");


    // form inputs from YOUR html

    const amount =
        document.getElementById("txAmount");

    const desc =
        document.getElementById("txDesc");

    const category =
        document.getElementById("txCategory");

    const date =
        document.getElementById("txDate");

    const notes =
        document.getElementById("txNotes");

    const txTableBody =
        document.getElementById("txTableBody");

    const recentTxList =
        document.getElementById("recentTxList");



    //=========================
    // APP STATE
    //=========================

    let transactions =
        JSON.parse(
            localStorage.getItem("transactions")
        ) || [];

    let selectedType = "expense";


    //=========================
    // DATE TOP BAR
    //=========================

    topbarDate.textContent =
        new Date().toLocaleDateString(
            "en-US",
            {
                weekday:"long",
                month:"long",
                day:"numeric",
                year:"numeric"
            }
        );


    //=========================
    // SIDEBAR TOGGLE
    //=========================

    sidebarToggle?.addEventListener(
        "click",
        ()=>{

        sidebar.classList.toggle(
            "collapsed"
        );

    });


    //=========================
    // PAGE NAVIGATION
    //=========================

    navItems.forEach(item=>{

        item.addEventListener(
            "click",
            e=>{

            let page =
                item.dataset.page;

            if(!page) return;

            e.preventDefault();

            pages.forEach(p=>{

                p.classList.add(
                    "hidden"
                );

            });

            document
            .getElementById(
                `page-${page}`
            )
            ?.classList
            .remove("hidden");

            navItems.forEach(n=>
                n.classList.remove(
                    "active"
                )
            );

            item.classList.add(
                "active"
            );

            topbarTitle.textContent =
                item.innerText.trim();

        });

    });



    //=========================
    // MODAL
    //=========================

    function openModal(){

        modal.classList.remove(
            "hidden"
        );

    }

    function closeModal(){

        modal.classList.add(
            "hidden"
        );

    }

    quickAddBtn?.addEventListener(
        "click",
        openModal
    );

    addTxBtn?.addEventListener(
        "click",
        openModal
    );

    modalClose?.addEventListener(
        "click",
        closeModal
    );

    modalCancel?.addEventListener(
        "click",
        closeModal
    );



    //=========================
    // TYPE BUTTONS
    //=========================

    document
    .querySelectorAll(".toggle-btn")
    .forEach(btn=>{

        btn.addEventListener(
            "click",
            ()=>{

            document
            .querySelectorAll(
                ".toggle-btn"
            )
            .forEach(b=>
                b.classList.remove(
                    "active"
                )
            );

            btn.classList.add(
                "active"
            );

            selectedType =
                btn.dataset.value;

        });

    });



    //=========================
    // SAVE TRANSACTION
    //=========================

    saveBtn.addEventListener(
        "click",
        ()=>{

        if(
            !amount.value ||
            !desc.value
        ){

            alert(
            "Fill required fields"
            );

            return;

        }

        const tx = {

            id:Date.now(),

            amount:
                Number(
                    amount.value
                ),

            desc:
                desc.value,

            category:
                category.value,

            date:
                date.value,

            notes:
                notes.value,

            type:
                selectedType
        };

        transactions.push(tx);

        localStorage.setItem(
            "transactions",
            JSON.stringify(
                transactions
            )
        );

        render();

        clearForm();

        closeModal();

    });




    //=========================
    // CLEAR FORM
    //=========================

    function clearForm(){

        amount.value="";
        desc.value="";
        category.value="";
        notes.value="";

    }



    //=========================
    // DASHBOARD CARDS
    //=========================

    function updateCards(){

        let income=0;
        let expense=0;

        transactions.forEach(t=>{

            if(
                t.type==="income"
            ){

                income+=t.amount;

            }

            else{

                expense+=t.amount;

            }

        });

        let balance =
            income-expense;

        document
        .querySelector(
        ".card-balance .card-value"
        ).textContent =
        `$${balance.toFixed(2)}`;

        document
        .querySelector(
        ".card-income .card-value"
        ).textContent =
        `$${income.toFixed(2)}`;

        document
        .querySelector(
        ".card-expense .card-value"
        ).textContent =
        `$${expense.toFixed(2)}`;

        document
        .querySelector(
        ".card-savings .card-value"
        ).textContent =
        `$${balance.toFixed(2)}`;

    }



    //=========================
    // TABLE
    //=========================

    function renderTable(){

        if(
            transactions.length===0
        ){

            txTableBody.innerHTML=
            `
            <tr class="empty-row">
            <td colspan="6">
            No transactions
            </td>
            </tr>
            `;

            return;
        }

        txTableBody.innerHTML="";

        transactions.forEach(tx=>{

            txTableBody.innerHTML +=
            `
            <tr>

            <td>${tx.date}</td>

            <td>${tx.desc}</td>

            <td>${tx.category}</td>

            <td>${tx.type}</td>

            <td class="align-right">
            $${tx.amount}
            </td>

            <td class="align-right">
            <button class="table-action delete"
            onclick="deleteTx(${tx.id})">
            Delete  
            </button>
            </td>

            </tr>
            `;

        });

    }



    //=========================
    // RECENT LIST
    //=========================

    function renderRecent(){

        if(
            transactions.length===0
        ){

            recentTxList.innerHTML=
            `<div class="tx-empty">
            No transactions yet
            </div>`;

            return;

        }

        recentTxList.innerHTML="";

        transactions
        .slice(-5)
        .reverse()
        .forEach(tx=>{

            recentTxList.innerHTML+=
            `
            <div class="tx-item">

            <strong>
            ${tx.desc}
            </strong>

            <span>
            $${tx.amount}
            </span>

            </div>
            `;

        });

    }



    //=========================
    // DELETE
    //=========================

    window.deleteTx=
    function(id){

        transactions=
        transactions.filter(
        t=>t.id!==id
        );

        localStorage.setItem(
        "transactions",
        JSON.stringify(
        transactions
        ));

        render();

    }



    //=========================
    // MASTER RENDER
    //=========================

    function render(){

        renderTable();

        renderRecent();

        updateCards();

    }

    render();

});