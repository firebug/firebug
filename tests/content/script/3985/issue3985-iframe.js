function trigger()
{
    document.getElementById('log').innerHTML += "<div>trigger</div>"; // set a breakpoint here
};

function init()
{
    document.getElementById('trigger').onclick = trigger;
}

window.onload = init;
