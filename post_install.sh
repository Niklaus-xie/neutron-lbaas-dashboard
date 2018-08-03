mkdir -p /usr/share/openstack-dashboard/openstack_dashboard/local/enabled/
cd /usr/lib/python2.7/site-packages
install -p -D -m 640 neutron_lbaas_dashboard/enabled/_1481_project* /usr/share/openstack-dashboard/openstack_dashboard/local/enabled/
