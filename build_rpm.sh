#!/bin/bash

rm -rf dist

python setup.py bdist_rpm --spec-only \
  --provides=neutron-lbaas-dashboard \
  --conflicts=neutron-lbaas-dashboard,openstack-neutron-lbaas-ui \
  --packager="Qin Zhao <q.zhao@f5.com>" \
  --post-install=post_install.sh

python setup.py sdist --formats=gztar

cd dist

VERSION=$(rpmspec -q --qf "%{version}" neutron-lbaas-dashboard.spec)

sed -i "s/^Name: %{name}$/Name: f5-openstack-neutron-lbaas-ui/" neutron-lbaas-dashboard.spec

OLD=neutron-lbaas-dashboard-${VERSION}
NEW=f5-openstack-neutron-lbaas-ui-${VERSION}

tar -zxf ${OLD}.tar.gz

mv ${OLD} ${NEW}

tar -cf ${NEW}.tar ${NEW}
gzip ${NEW}.tar

cp ${NEW}.tar.gz /root/rpmbuild/SOURCES

rpmbuild -bb neutron-lbaas-dashboard.spec

cd ..
