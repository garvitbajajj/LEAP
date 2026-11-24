// LEAP - declarative CI/CD pipeline
// Requires: NodeJS plugin (tool "node20"), Docker on the agent, JUnit plugin.
// Credentials: "dockerhub" (username/password) for the push stage.

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    REGISTRY = 'docker.io/garvitbajajj'
    TAG = "${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Install') {
      parallel {
        stage('server') { steps { dir('server') { sh 'npm ci' } } }
        stage('client') { steps { dir('client') { sh 'npm ci' } } }
        stage('ml')     { steps { dir('ml')     { sh 'python3 -m pip install -r requirements.txt' } } }
      }
    }

    stage('Lint') {
      steps { dir('server') { sh 'npm run lint' } }
    }

    stage('Unit Test') {
      parallel {
        stage('server - jest')  { steps { dir('server') { sh 'npx jest --ci --coverage' } } }
        stage('ml - pytest')    { steps { dir('ml')     { sh 'python3 -m pytest -q --junitxml=pytest-results.xml' } } }
        stage('client - vitest'){ steps { dir('client') { sh 'npx vitest run' } } }
        stage('e2e - maven')    { steps { dir('tests/e2e') { sh 'mvn -B test' } } }
      }
    }

    stage('API & E2E (live stack)') {
      when { expression { env.LEAP_E2E_URL?.trim() } }
      steps {
        sh 'npx --yes newman run postman/LEAP.postman_collection.json -e postman/LEAP.local.postman_environment.json --env-var "baseUrl=${LEAP_E2E_URL}" --env-var "apiBase=${LEAP_E2E_URL}/api/v1" --insecure --reporters cli,junit --reporter-junit-export postman/newman-report.xml'
        dir('tests/e2e') {
          sh 'mvn -B verify -Dleap.baseUrl=${LEAP_E2E_URL} -Dleap.headless=true'
        }
      }
    }

    stage('Build') {
      steps { dir('client') { sh 'npm run build' } }
    }

    stage('Docker Images') {
      steps {
        sh 'docker build -t $REGISTRY/leap-server:$TAG server'
        sh 'docker build -t $REGISTRY/leap-ml:$TAG ml'
        sh 'docker build -t $REGISTRY/leap-client:$TAG client'
      }
    }

    stage('Push') {
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
          sh 'for s in server ml client; do docker push $REGISTRY/leap-$s:$TAG; done'
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      steps { sh 'docker compose up -d --build' }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'ml/pytest-results.xml,tests/e2e/target/surefire-reports/*.xml,tests/e2e/target/failsafe-reports/*.xml,postman/newman-report.xml'
      archiveArtifacts allowEmptyArchive: true, artifacts: 'server/coverage/**,tests/e2e/target/screenshots/**'
    }
    success { echo 'LEAP pipeline passed' }
    failure { echo 'LEAP pipeline failed - check the stage logs above' }
  }
}
