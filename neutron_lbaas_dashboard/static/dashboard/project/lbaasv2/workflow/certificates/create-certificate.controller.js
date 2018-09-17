/*
 *    (c) Copyright 2018, F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function () {
  'use strict';

  angular
    .module('horizon.dashboard.project.lbaasv2')
    .controller('LaunchLoadBalancerCreateCertificateController',
                LaunchLoadBalancerCreateCertificateController);

  LaunchLoadBalancerCreateCertificateController.$inject = [
    '$q',
    '$modalInstance',
    'certificateModel',
    'horizon.framework.util.i18n.gettext',
    'horizon.framework.widgets.toast.service',
    'horizon.app.core.openstack-service-api.barbican',
    'horizon.app.core.openstack-service-api.serviceCatalog'
  ];

  /**
   * @ngdoc controller
   * @name horizon.dashboard.project.lbaasv2.LaunchLoadBalancerCreateCertificateController
   * @param {object} $q Used to create and pass promise.
   * @param {object} $modalInstance Used to conctrol modal liftcycle.
   * @param {object} certificateModel Certificate model used to access properties and functions.
   * @param {function} gettext text operation.
   * @param {service} toastService toast service.
   * @param {service} barbicanAPI barbican api for get/create operation.
   * @param {service} serviceCatalog Used to justify if key mananger if available.
   * @description
   * Provide a dialog for creation of a new key pair.
   * @returns {undefined} undefined
   */
  function LaunchLoadBalancerCreateCertificateController(
      $q,
      $modalInstance,
      certificateModel,
      gettext,
      toastService,
      barbicanAPI,
      serviceCatalog
    ) {

    var ctrl = this;

    ctrl.passType = 'text';
    ctrl.statusCreating = false;

    ctrl.submit = submit;
    ctrl.cancel = cancel;

    ctrl.revealPassword = revealPassword;
    ctrl.hidePassword = hidePassword;
    ctrl.afterCertName = afterCertName;
    ctrl.doesCertificateExist = doesCertificateExist;

    ctrl.certNameError = gettext('Certificate already exists or name contains bad characters.');
    ctrl.certificateError = gettext('Certificate format error. Please fix it.');
    ctrl.privateKeyError = gettext('Private key format error. Please fix it.');
    ctrl.intermediateError = gettext('Intermediate Certificate format error. Please fix it.');

    ctrl.certificateSpec = {
      certificate: {
        name: '',
        payload: '',
        payload_content_type: 'text/plain'
      },
      private_key: {
        name: '',
        payload: '',
        payload_content_type: 'text/plain'
      },
      passphrase: {
        name: '',
        payload: '',
        payload_content_type: 'text/plain'
      },
      intermediate: {
        name: '',
        payload: '',
        payload_content_type: 'text/plain'
      }
    };

    ctrl.containerSpec = {
      type: 'certificate',
      name: ctrl.certificateSpec.certificate.name,
      secret_refs: []
    };

    /**
     * @ngdoc function
     * @name submit
     * @description
     * Create new certificates for loadbalancers of terminated_https. The process
     * will be triggerred only when keymanager is available(can be connected.).
     * There would be success/error notification for each steps(secrets/container).
     * @returns {undefined} undefined
     */
    function submit() {
      ctrl.statusCreating = true;
      var keymanagerPromise = serviceCatalog.ifTypeEnabled('key-manager');

      keymanagerPromise
        .then(createSecrets, keymanagerNotSupport)
        .then(createContainer, createSecretsError)
        .then(onSucceedCreate, certificateError)
        .finally($modalInstance.close);
    }

    /**
     * @ngdoc function
     * @name cancel
     * @description
     * Dismisses the modal
     * @returns {undefined} undefined
     */
    function cancel() {
      $modalInstance.dismiss();
    }

    /**
     * @ngdoc function
     * @name createSecrets
     * @description
     * Create the secrets needed for creating SSL Certificate container. The creations
     * for all secrets are in parallel way which can save creating time. The passphrase
     * and intermediates will be executed to create only when the content(payload) is
     * not empty.
     * @returns {promises} promises of create secrets
     */
    function createSecrets() {
      var spec = ctrl.certificateSpec;

      var promises = $q.all(
        [
          barbicanAPI.createSecret(spec.certificate).then(onCreateCertSecret),
          barbicanAPI.createSecret(spec.private_key).then(onCreatePrivateKeySecret),
          spec.passphrase.payload === ''
            ? angular.noop : barbicanAPI.createSecret(spec.passphrase)
                                        .then(onCreatePassphraseSecret),
          spec.intermediate.payload === ''
            ? angular.noop : barbicanAPI.createSecret(spec.intermediate)
                                        .then(onCreateIntermediateSecret)
        ]
      );

      return promises;
    }

    /**
     * @ngdoc function
     * @name keymanagerNotSupport
     * @description
     * Notify user about the key manager cannot be connected.
     * @returns {undefined} undefined
     */
    function keymanagerNotSupport() {
      toastService.add('error', gettext("Unable to connect to key manager."));
    }

     /**
     * @ngdoc function
     * @name createContainer
     * @description
     * Create certificate container with desired spec object.
     * @returns {promise} promise of create certificate container.
     */
    function createContainer() {
      return barbicanAPI.createCertificate(ctrl.containerSpec);
    }

    /**
     * @ngdoc function
     * @name createSecretsError
     * @description
     * Notify user about the failure of secrets creation.
     * @returns {undefined} undefined
     */
    function createSecretsError() {
      toastService.add('error', gettext("Error(s) in creating secrets."));
    }

    /**
     * @ngdoc function
     * @name onSucceedCreate
     * @description
     * Notify user that secrets and certificate container are created successfully,
     * and refresh the loadbalancer creation model to list certificates.
     * @returns {undefined} undefined
     */
    function onSucceedCreate() {
      toastService.add('success', gettext("Certificates creation succeeds."));
      certificateModel.prepareCertificates();
    }

     /**
     * @ngdoc function
     * @name certificateError
     * @description
     * Notify user about the failure of container creation.
     * @returns {undefined} undefined
     */
    function certificateError() {
      toastService.add('error', gettext("Unable to create container."));
    }

     /**
     * @ngdoc function
     * @name onCreateCertSecret
     * @param {object} result The result of creating certificate secret.
     * @description
     * Collect certificate secret creation result.
     * @returns {undefined} undefined
     */
    function onCreateCertSecret(result) {
      ctrl.containerSpec.secret_refs.push({
        name: 'certificate',
        secret_ref: result.data.secret_ref
      });
    }

    /**
     * @ngdoc function
     * @name onCreatePrivateKeySecret
     * @param {object} result The result of creating private key.
     * @description
     * Collect private_key secret creation result.
     * @returns {undefined} undefined
     */
    function onCreatePrivateKeySecret(result) {
      ctrl.containerSpec.secret_refs.push({
        name: 'private_key',
        secret_ref: result.data.secret_ref
      });
    }

     /**
     * @ngdoc function
     * @name onCreatePassphraseSecret
     * @param {object} result The result returned by barbicanAPI.createSecret.
     * @description
     * Collect passphrase secret creation result.
     * @returns {undefined} undefined
     */
    function onCreatePassphraseSecret(result) {
      ctrl.containerSpec.secret_refs.push({
        name: 'private_key_passphrase',
        secret_ref: result.data.secret_ref
      });
    }

    /**
     * @ngdoc function
     * @name onCreateIntermediateSecret
     * @param {object} result The result returned by barbicanAPI.createSecret.
     * @description
     * Collect intermediate secret creation result.
     * @returns {undefined} undefined
     */
    function onCreateIntermediateSecret(result) {
      ctrl.containerSpec.secret_refs.push({
        name: 'intermediates',
        secret_ref: result.data.secret_ref
      });
    }

    /**
     * @ngdoc function
     * @name afterCertName
     * @description
     * Name the other secret's name besides certificate.
     * @returns {undefined} undefined
     */
    function afterCertName() {
      var spec = ctrl.certificateSpec;
      spec.private_key.name = spec.certificate.name + "-private_key";
      spec.passphrase.name = spec.certificate.name + "-passphrase";
      spec.intermediate.name = spec.certificate.name + "-intermediate";
    }

    /**
     * @ngdoc function
     * @name revealPassword
     * @description
     * Make the password visible on UI.
     * @returns {undefined} undefined
     */
    function revealPassword() {
      ctrl.passType = 'text';
    }

    /**
     * @ngdoc function
     * @name hidePassword
     * @description
     * Make the password invisible on UI.
     * @returns {undefined} undefined
     */
    function hidePassword() {
      ctrl.passType = 'password';
    }

    /**
     * @ngdoc function
     * @name doesCertificateExist
     * @description
     * Check the certificate exists or not.
     * @returns {boolean} exists or not.
     */
    function doesCertificateExist() {
      var exists = function(certificate) {
        return getCertificates().indexOf(certificate) !== -1;
      };
      return exists(ctrl.certificateSpec.certificate.name);
    }

    /**
     * @ngdoc function
     * @name getCertificates
     * @description
     * Get the certificate map (for ssl certificate creation model).
     * @returns {map} map of certificates
     */
    function getCertificates() {
      return certificateModel.certificates.map(function(item) {
        return item.name;
      });
    }
  }
})();
