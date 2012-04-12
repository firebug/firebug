<?php
set_time_limit(10);
header('Cache-Control: no-cache');
header('Pragma: no-cache');
header('Content-type: text/javascript');
sleep(2);   // Sleep for 2 sec.
?>
function myFunction()
{
    return "Delayed script loaded OK";
}