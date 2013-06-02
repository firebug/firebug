<?php
set_time_limit(300);
header('Content-type: multipart/x-mixed-replace;boundary=NEXTPART');
for ($i = 0; $i < 4; $i++) {
  print "Part$i+";
  ob_flush();
  flush();
    sleep(1);
}
?>