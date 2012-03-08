<?php
header("Content-Type: text/plain");
for ($i=0; $i<80000; $i++) {
    echo $i;
    echo " ";
    //flush();
    //if ($i%5 == 0)
    //    usleep(1);
}
?>
